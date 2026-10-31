import type { WgslResource } from '../../scene/shaders/WgslResource';
import type { BindingSource } from '../../scene/flows/FlowBinding';
import { WORKGROUP_SIZE } from '../../scene/shaders/engineConstants';
import type { PoolBufferSpec } from '../../scene/contracts/PoolDirectory';
import type { BoundPool } from '../../scene/flows/slots';
import type {
    ComputePass,
    Frame,
    StorageBufferSpec,
    UniformBufferSpec,
} from '../../scene/contracts/gpu';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { WorkContext, WorkPart } from '../../scene/flows/FlowWork';
import {
    createComputeKernel,
    destroyComputeKernel,
    type ComputeKernel,
} from '../../scene/flows/createComputeKernel';
import {
    neighborResources as R,
    nsAssignCount,
    nsFind,
    nsScatter,
    nsSortCells,
} from './shaders/neighborSearch';
import { NsSimParamsSchema } from './schemas';
import { PrefixSum } from './compute/PrefixSum';
import { wordBuffer } from './compute/schemas';

/** Teto de vizinhos por partícula (tamanho da região de cada partícula na lista de vizinhos). */
const MAX_NEIGHBORS = 128;

/**
 * Configuração do NeighborSearchPipeline. Define o grid uniform usado
 * para spatial hashing e capacidades dos buffers.
 */
export interface NeighborSearchOptions {
    /** Dimensões do grid (cells por eixo). Default: [32, 32, 32]. */
    readonly gridDim?: readonly [number, number, number];
    /** Tamanho de uma cell em world units. Default: 0.1. */
    readonly cellSize?: number;
    /** Origem (canto -X-Y-Z) do grid em world coords. */
    readonly origin?: readonly [number, number, number];
    /** Capacidade máxima de partículas (alocação fixa do buffer). */
    readonly maxParticles: number;
    /** Máximo de vizinhos retornados por partícula (truncate). */
    readonly maxNeighbors: number;
    /**
     * Stride do particle struct em floats (e.g. 16 para SPHParticle = 64 bytes).
     * O kernel `assign_count` lê o particle.position desde esse offset.
     */
    readonly particleStrideF32: number;
    /** Prefixo único dos ids dos descritores no Resource de trabalho (várias instâncias no mesmo trabalho). */
    readonly discriminator: string;
    /**
     * A busca roda e grava na ordem por célula (`neighborOrder`): a lista e a contagem pelo posto `t` da partícula
     * `neighborOrder[t] − 1`, e quem as lê roda na mesma ordem — threads vizinhos tratam partículas vizinhas e leem os
     * mesmos vizinhos (o cache da GPU os reaproveita). Padrão: pelo índice da partícula.
     */
    readonly byRank?: boolean;
}

/**
 * Teto de partículas por pool dos estágios que usam a busca de vizinhança (SPH, PBF): o tamanho das listas da grade.
 * A lista de vizinhos (128 por partícula, 4 bytes cada) fica em 64 MiB — metade do limite padrão do WebGPU por ligação
 * de storage (128 MiB), em qualquer plataforma; alocada só quando um estágio de fluido a usa.
 */
export const NEIGHBOR_SEARCH_MAX_PARTICLES = 131072;

/**
 * NeighborSearchPipeline implementa busca de vizinhos GPU via spatial
 * hashing + parallel prefix scan + scatter:
 *   1. `assign_count`: cada partícula computa cell index + atomicAdd em cellCount.
 *   2. soma de prefixos exclusiva cellCount → cellStart (offsets por cell) pelo `PrefixSum` genérico — qualquer
 *      número de células.
 *   3. `scatter`: cada partícula é escrita em sortedParticles[cellStart[cell] + cursor].
 *   4. `sort_cells` (spec 008): cada célula é ordenada por índice — o espalhamento atômico varia a ordem entre execuções.
 *   5. `find`: cada partícula busca vizinhos nas 27 cells adjacentes, numa ordem fixa, via
 *      sortedParticles[cellStart[c]..cellStart[c]+cellCount[c]] — a lista sai determinística, gravada direto.
 *
 * Usado por SPHFlow e PBFFlow para acelerar density/forces computation.
 */
/**
 * Busca de vizinhos por grade uniforme (contagem por célula, soma de prefixos, espalhamento, ordem por célula, busca).
 * O espaço de trabalho — a grade, as listas por partícula, os parâmetros — é descritor do Resource de trabalho do Flow
 * dono (spec 039): a C2 aloca e libera; a instância só liga os kernels ao que a C2 alocou.
 */
export class NeighborSearchPipeline implements WorkPart {
    /**
     * Confere que o pool cabe no teto da busca (`NEIGHBOR_SEARCH_MAX_PARTICLES`).
     * @throws RangeError nomeando o estágio, a entidade do corpo que passou do teto, a contagem e o teto.
     */
    static requireCapacity(stage: string, pool: BoundPool): void {
        if (pool.count <= NEIGHBOR_SEARCH_MAX_PARTICLES) return;
        const entity = pool.entityAt(NEIGHBOR_SEARCH_MAX_PARTICLES);
        throw new RangeError(
            `${stage}: o pool '${pool.poolKey}' chegou a ${pool.count} partículas (corpo da entidade ${entity ?? '?'}); `
                + `o teto da busca de vizinhança é ${NEIGHBOR_SEARCH_MAX_PARTICLES}.`,
        );
    }

    private readonly disc: string;
    private readonly gridDim: readonly [number, number, number];
    private readonly cellSize: number;
    private readonly origin: readonly [number, number, number];
    private readonly maxParticles: number;
    private readonly maxNeighbors: number;
    private readonly particleStrideF32: number;
    private readonly cellCount: number;

    /** Soma de prefixos das contagens por célula. */
    private readonly scan: PrefixSum;
    private readonly byRank: boolean;

    private assignKernel: ComputeKernel | null = null;
    private scatterKernel: ComputeKernel | null = null;
    private sortCellsKernel: ComputeKernel | null = null;
    private findKernel: ComputeKernel | null = null;

    /** Contagem escrita em `NsSimParams` (-1 = ainda não escrito). */
    private uploadedParticleCount = -1;
    private currentParticlesBuffer: PoolBufferSpec | null = null;
    private currentLiveBuffer: StorageBufferSpec | null = null;

    constructor(
        private readonly ctx: WorkContext,
        options: NeighborSearchOptions,
    ) {
        if (!(options.maxNeighbors >= 1 && options.maxNeighbors <= MAX_NEIGHBORS)) {
            throw new RangeError(
                `NeighborSearchPipeline: maxNeighbors deve estar em [1, ${MAX_NEIGHBORS}] (recebeu ${options.maxNeighbors})`,
            );
        }
        this.disc = options.discriminator;
        this.gridDim = options.gridDim ?? [32, 32, 32];
        this.cellSize = options.cellSize ?? 0.1;
        this.origin = options.origin ?? [-1.6, -1.6, -1.6];
        this.maxParticles = options.maxParticles;
        this.maxNeighbors = options.maxNeighbors;
        this.particleStrideF32 = options.particleStrideF32;
        // A grade e a célula extra das partículas fora dela (na ordem por célula, nunca vizinhas de ninguém).
        this.cellCount = this.gridDim[0] * this.gridDim[1] * this.gridDim[2] + 1;
        this.byRank = options.byRank === true;
        this.scan = new PrefixSum(ctx, {
            discriminator: `ns_scan:${this.disc}`,
            capacity: this.cellCount,
        });
        ctx.work.use(this);
    }

    descriptors(): readonly GPUDescriptor[] {
        const cells = this.cellCount * 4;
        const perParticle = this.maxParticles * 4;
        return [
            { id: this.id('params'), role: 'uniform', schema: NsSimParamsSchema, upload: 'never' },
            wordBuffer(this.id('cell_count'), cells),
            wordBuffer(this.id('cell_start'), cells),
            wordBuffer(this.id('cell_cursor'), cells),
            wordBuffer(this.id('cell_ids'), perParticle),
            wordBuffer(this.id('sorted'), perParticle),
            wordBuffer(this.id('sorted_pos'), this.maxParticles * 16),
            wordBuffer(this.id('nlist'), perParticle * this.maxNeighbors),
            wordBuffer(this.id('ncount'), perParticle),
            wordBuffer(this.id('order'), perParticle),
        ];
    }

    private id(name: string): string {
        return `ns:${this.disc}:${name}`;
    }

    /** O buffer que a C2 alocou para o descritor `name` (ou `null` antes do trabalho entrar na cena). */
    private buffer(name: string): StorageBufferSpec | null {
        return (
            (this.ctx.resources.bufferOf(this.ctx.work, this.id(name)) as
                | StorageBufferSpec
                | undefined) ?? null
        );
    }

    private get core() {
        return this.ctx.core;
    }

    private get paramsBuffer(): UniformBufferSpec | null {
        return this.buffer('params') as UniformBufferSpec | null;
    }
    private get cellCountBuffer(): StorageBufferSpec | null {
        return this.buffer('cell_count');
    }
    private get cellStartBuffer(): StorageBufferSpec | null {
        return this.buffer('cell_start');
    }
    private get cellCursorBuffer(): StorageBufferSpec | null {
        return this.buffer('cell_cursor');
    }
    private get cellIdsBuffer(): StorageBufferSpec | null {
        return this.buffer('cell_ids');
    }
    private get sortedParticlesBuffer(): StorageBufferSpec | null {
        return this.buffer('sorted');
    }
    /** Posições na ordem de `sortedParticles` (vec4 por partícula), lidas em sequência pela busca. */
    private get sortedPositionsBuffer(): StorageBufferSpec | null {
        return this.buffer('sorted_pos');
    }
    private get neighborListBuffer(): StorageBufferSpec | null {
        return this.buffer('nlist');
    }
    private get neighborCountBuffer(): StorageBufferSpec | null {
        return this.buffer('ncount');
    }
    private get orderBuffer(): StorageBufferSpec | null {
        return this.buffer('order');
    }

    /** Libera os kernels que ligam o buffer de partículas (assign e find). */
    private releaseParticleKernels(): void {
        if (this.assignKernel !== null) destroyComputeKernel(this.core, this.assignKernel);
        if (this.findKernel !== null) destroyComputeKernel(this.core, this.findKernel);
        if (this.sortCellsKernel !== null) destroyComputeKernel(this.core, this.sortCellsKernel);
        this.assignKernel = null;
        this.findKernel = null;
        this.sortCellsKernel = null;
    }

    /**
     * Compatibilidade da sequência dos Flows: o espaço de trabalho já é declarado na construção e alocado pela C2 com o
     * Resource de trabalho (spec 039). Os Flows montam os próprios kernels depois, ligando `neighborList`/`neighborCount`.
     */
    allocate(): void {}

    /** Libera os kernels e tira os descritores da busca do trabalho (a C2 libera os buffers). */
    dispose(): void {
        this.releaseParticleKernels();
        if (this.scatterKernel !== null) destroyComputeKernel(this.core, this.scatterKernel);
        this.scatterKernel = null;
        this.scan.destroy();
        // Os descritores da busca saem do trabalho (uma busca recriada com outra grade não deixa os antigos).
        this.ctx.work.drop(this.scan);
        this.ctx.work.drop(this);
        this.currentParticlesBuffer = null;
        this.currentLiveBuffer = null;
        this.uploadedParticleCount = -1;
    }

    /**
     * Prepara a busca para o buffer de partículas `particlesBuffer` e até `rebuildsPerFrame` reconstruções por quadro:
     * buffers da grade, kernels e a soma de prefixos. Idempotente; fora da gravação (numa transição do Flow — ex.: o
     * pool de partículas cresceu ou o número de passos do quadro mudou).
     */
    prepare(
        particlesBuffer: PoolBufferSpec,
        liveBuffer: StorageBufferSpec,
        rebuildsPerFrame = 1,
    ): void {
        this.scan.prepare(this.cellStartBuffer!, rebuildsPerFrame);
        if (
            this.currentParticlesBuffer !== particlesBuffer
            || this.currentLiveBuffer !== liveBuffer
        ) {
            this.releaseParticleKernels();
            this.currentParticlesBuffer = particlesBuffer;
            this.currentLiveBuffer = liveBuffer;
        }
        const nsParams = this.paramsBuffer!;
        this.assignKernel ??= createComputeKernel(this.core, {
            discriminator: `ns_assign:${this.disc}`,
            shader: nsAssignCount,
            entryPoint: 'ns_assign_count_main',
            bindings: new Map<WgslResource, BindingSource>([
                [R.params, nsParams],
                [R.particles, particlesBuffer],
                [R.live, liveBuffer],
                [R.cellIds, this.cellIdsBuffer!],
                [R.cellCount, this.cellCountBuffer!],
            ]),
        });
        this.scatterKernel ??= createComputeKernel(this.core, {
            discriminator: `ns_scatter:${this.disc}`,
            shader: nsScatter,
            entryPoint: 'ns_scatter_main',
            bindings: new Map<WgslResource, BindingSource>([
                [R.params, nsParams],
                [R.cellIdsRead, this.cellIdsBuffer!],
                [R.cellCursor, this.cellCursorBuffer!],
                [R.sortedParticles, this.sortedParticlesBuffer!],
                [R.order, this.orderBuffer!],
            ]),
        });
        this.sortCellsKernel ??= createComputeKernel(this.core, {
            discriminator: `ns_sort_cells:${this.disc}`,
            shader: nsSortCells,
            entryPoint: 'ns_sort_cells_main',
            bindings: new Map<WgslResource, BindingSource>([
                [R.params, nsParams],
                [R.cellStart, this.cellStartBuffer!],
                [R.cellCountRead, this.cellCountBuffer!],
                [R.sortedParticles, this.sortedParticlesBuffer!],
                [R.particles, particlesBuffer],
                [R.sortedPositions, this.sortedPositionsBuffer!],
                [R.order, this.orderBuffer!],
            ]),
        });
        this.findKernel ??= createComputeKernel(this.core, {
            discriminator: `ns_find:${this.disc}`,
            shader: nsFind,
            entryPoint: 'ns_find_main',
            bindings: new Map<WgslResource, BindingSource>([
                [R.params, nsParams],
                [R.particles, particlesBuffer],
                [R.cellStart, this.cellStartBuffer!],
                [R.cellCountRead, this.cellCountBuffer!],
                [R.sortedParticlesRead, this.sortedParticlesBuffer!],
                [R.neighborList, this.neighborListBuffer!],
                [R.neighborCount, this.neighborCountBuffer!],
                [R.live, liveBuffer],
                [R.sortedPositionsRead, this.sortedPositionsBuffer!],
                [R.orderRead, this.orderBuffer!],
            ]),
        });
    }

    /**
     * Escreve `NsSimParams` quando a contagem muda. Os parâmetros são os mesmos em todas as reconstruções do
     * quadro, então uma escrita (que entra na fila antes do quadro — research A1) vale para todas.
     */
    private uploadParams(particleCount: number): void {
        if (this.paramsBuffer === null || this.uploadedParticleCount === particleCount) return;
        this.uploadedParticleCount = particleCount;
        this.ctx.resources.writeNow(
            this.ctx.work,
            this.id('params'),
            NsSimParamsSchema.pack({
                origin: this.origin,
                cell_size: this.cellSize,
                grid_x: this.gridDim[0],
                grid_y: this.gridDim[1],
                grid_z: this.gridDim[2],
                cell_count: this.cellCount,
                particle_count: particleCount,
                particle_stride: this.particleStrideF32,
                max_neighbors: this.maxNeighbors,
                list_stride: this.maxParticles,
                by_rank: this.byRank ? 1 : 0,
            }),
        );
    }

    /**
     * Lista de vizinhos intercalada — o vizinho `n` da partícula `p` em `neighborList[n * maxParticles + p]` (leituras e
     * escritas contíguas entre partículas vizinhas)
     * dá o índice da n-ésima partícula vizinha de p (até `neighborCount[p]`).
     * Null antes de `rebuild` ser chamado pela primeira vez.
     */
    get neighborList(): StorageBufferSpec | null {
        return this.neighborListBuffer;
    }

    /**
     * Grade da última reconstrução (spec 010, partículas secundárias): `cellStart[c]` e `cellCount[c]` dão a faixa da
     * célula `c` em `sortedParticles` (índices das partículas, em ordem dentro da célula); origem, dimensões e aresta da
     * célula para achar a célula de um ponto qualquer. Null antes de `allocate`.
     */
    get grid(): {
        readonly cellStart: StorageBufferSpec;
        readonly cellCount: StorageBufferSpec;
        readonly sortedParticles: StorageBufferSpec;
        readonly origin: readonly [number, number, number];
        readonly gridDim: readonly [number, number, number];
        readonly cellSize: number;
    } | null {
        if (
            this.cellStartBuffer === null
            || this.cellCountBuffer === null
            || this.sortedParticlesBuffer === null
        )
            return null;
        return {
            cellStart: this.cellStartBuffer,
            cellCount: this.cellCountBuffer,
            sortedParticles: this.sortedParticlesBuffer,
            origin: this.origin,
            gridDim: this.gridDim,
            cellSize: this.cellSize,
        };
    }

    /**
     * Buffer de contadores — `neighborCount[p]` é o número de vizinhos
     * encontrados para a partícula p (≤ maxNeighbors).
     */
    get neighborCount(): StorageBufferSpec | null {
        return this.neighborCountBuffer;
    }

    /** A ordem por célula: no posto `t`, a partícula + 1 (0: posto vazio). Null antes de `allocate`. */
    get neighborOrder(): StorageBufferSpec | null {
        return this.orderBuffer;
    }

    /**
     * Grava a reconstrução das listas de vizinhos para as `particleCount` partículas do buffer preparado (`prepare`).
     * `particleCount = 0` não grava nada.
     *
     * Sequência: assign_count → soma de prefixos (cellCount → cellStart) → copy(cellStart, cellCursor) → scatter →
     * sort_cells (cada célula em ordem de índice) → find. São três passes de computação (as cópias e zeragens ficam
     * entre eles): cada passe aberto custa mais que um despacho de dezenas de milhares de partículas, e dentro de um
     * passe cada despacho já vê o que o anterior escreveu. `then` grava, no mesmo passe da busca, os despachos do
     * consumidor que leem as listas.
     * @throws Error se `prepare` não foi chamado.
     */
    rebuild(frame: Frame, particleCount: number, then?: (pass: ComputePass) => void): void {
        if (particleCount === 0) return;
        const assign = this.assignKernel;
        const scan = this.scan;
        const scatter = this.scatterKernel;
        const sortCells = this.sortCellsKernel;
        const find = this.findKernel;
        if (assign === null || scatter === null || sortCells === null || find === null) {
            throw new Error(
                `NeighborSearchPipeline(${this.disc}): prepare(partículas) antes de gravar.`,
            );
        }
        const cellCount = this.cellCountBuffer!;
        const cellStart = this.cellStartBuffer!;
        this.uploadParams(particleCount);
        // Zeradas no fluxo de comandos: cada reconstrução do quadro começa de contagens nulas.
        frame.clear(cellCount, 0, this.cellCount * 4);
        frame.clear(this.neighborCountBuffer!, 0, particleCount * 4);
        frame.clear(this.orderBuffer!, 0, particleCount * 4);
        const run = (
            pass: ComputePass,
            k: ComputeKernel,
            invocations: number,
            label: string,
        ): void => {
            pass.marker(label);
            pass.bind.setPipeline(k.pipeline);
            k.bindTo(pass.bind);
            pass.dispatch.invocations(invocations, WORKGROUP_SIZE.value);
        };
        frame.compute('NS.assign_count', (pass) => {
            run(pass, assign, particleCount, 'NS.assign_count');
        });
        // A soma no lugar dentro de um passe: cellStart recebe as contagens e é somado ali.
        frame.copy(cellCount, cellStart, this.cellCount * 4);
        frame.compute('NS.scan', (pass) => {
            scan.record(frame, { src: cellStart, dst: cellStart, count: this.cellCount, pass });
        });
        // cell_cursor recebe cópia de cell_start: scatter usa atomicAdd em
        // cell_cursor para alocar o slot dentro do range [start, start+count).
        frame.copy(cellStart, this.cellCursorBuffer!, this.cellCount * 4);
        frame.compute('NS.search', (pass) => {
            run(pass, scatter, particleCount, 'NS.scatter');
            // Ordem fixa dentro de cada célula: a busca grava a lista determinística direto (sem ordenar por partícula).
            run(pass, sortCells, this.cellCount, 'NS.sort_cells');
            run(pass, find, particleCount, 'NS.find');
            then?.(pass);
        });
    }
}
