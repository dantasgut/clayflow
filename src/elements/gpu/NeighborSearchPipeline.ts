import type { PoolBufferSpec } from '../../scene/contracts/PoolDirectory';
import type {
    EngineCore,
    Frame,
    StorageBufferSpec,
    UniformBufferSpec,
} from '../../scene/contracts/gpu';
import {
    createComputeKernel,
    destroyComputeKernel,
    type ComputeKernel,
} from '../../scene/flows/createComputeKernel';
import { nsAssignCount, nsFind, nsScatter } from './shaders/neighborSearch';
import { NsSimParamsSchema } from './schemas';
import { PrefixSum } from './compute/PrefixSum';

/** Teto de vizinhos por partícula: tamanho do vetor local em que `ns_find` ordena a lista (`NS_MAX_NEIGHBORS`). */
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
    /** Discriminador único para isolar buffers entre múltiplas instâncias. */
    readonly discriminator: string;
}

/**
 * NeighborSearchPipeline implementa busca de vizinhos GPU via spatial
 * hashing + parallel prefix scan + scatter:
 *   1. `assign_count`: cada partícula computa cell index + atomicAdd em cellCount.
 *   2. soma de prefixos exclusiva cellCount → cellStart (offsets por cell) pelo `PrefixSum` genérico — qualquer
 *      número de células.
 *   3. `scatter`: cada partícula é escrita em sortedParticles[cellStart[cell] + cursor].
 *   4. `find`: cada partícula busca vizinhos nas 27 cells adjacentes via
 *      sortedParticles[cellStart[c]..cellStart[c]+cellCount[c]].
 *
 * Usado por SPHFlow e PBFFlow para acelerar density/forces computation.
 */
export class NeighborSearchPipeline {
    private readonly disc: string;
    private readonly gridDim: readonly [number, number, number];
    private readonly cellSize: number;
    private readonly origin: readonly [number, number, number];
    private readonly maxParticles: number;
    private readonly maxNeighbors: number;
    private readonly particleStrideF32: number;
    private readonly cellCount: number;

    private paramsBuffer: UniformBufferSpec | null = null;
    private cellCountBuffer: StorageBufferSpec | null = null;
    private cellStartBuffer: StorageBufferSpec | null = null;
    private cellCursorBuffer: StorageBufferSpec | null = null;
    private cellIdsBuffer: StorageBufferSpec | null = null;
    /** Soma de prefixos das contagens por célula. */
    private scan: PrefixSum | null = null;
    private sortedParticlesBuffer: StorageBufferSpec | null = null;
    private neighborListBuffer: StorageBufferSpec | null = null;
    private neighborCountBuffer: StorageBufferSpec | null = null;

    private assignKernel: ComputeKernel | null = null;
    private scatterKernel: ComputeKernel | null = null;
    private findKernel: ComputeKernel | null = null;

    /** Contagem escrita em `NsSimParams` (-1 = ainda não escrito). */
    private uploadedParticleCount = -1;
    private currentParticlesBuffer: PoolBufferSpec | null = null;

    constructor(
        private readonly core: EngineCore,
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
        this.cellCount = this.gridDim[0] * this.gridDim[1] * this.gridDim[2];
    }

    /** Libera os kernels que ligam o buffer de partículas (assign e find). */
    private releaseParticleKernels(): void {
        if (this.assignKernel !== null) destroyComputeKernel(this.core, this.assignKernel);
        if (this.findKernel !== null) destroyComputeKernel(this.core, this.findKernel);
        this.assignKernel = null;
        this.findKernel = null;
    }

    /**
     * Aloca os buffers da busca (grade, contagens, lista de vizinhos). Idempotente. Os Flows chamam antes de montar
     * os próprios kernels, que ligam `neighborList`/`neighborCount`.
     */
    allocate(): void {
        if (this.paramsBuffer === null) {
            this.paramsBuffer = this.core.create<UniformBufferSpec>({
                kind: 'buffer',
                subkind: 'uniform',
                discriminator: `ns_params:${this.disc}`,
                byteSize: NsSimParamsSchema.stride,
            });
        }
        if (this.cellCountBuffer === null) {
            this.cellCountBuffer = this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `ns_cell_count:${this.disc}`,
                byteSize: this.cellCount * 4,
            });
        }
        if (this.cellStartBuffer === null) {
            this.cellStartBuffer = this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `ns_cell_start:${this.disc}`,
                byteSize: this.cellCount * 4,
            });
        }
        if (this.cellCursorBuffer === null) {
            this.cellCursorBuffer = this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `ns_cell_cursor:${this.disc}`,
                byteSize: this.cellCount * 4,
            });
        }
        if (this.cellIdsBuffer === null) {
            this.cellIdsBuffer = this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `ns_cell_ids:${this.disc}`,
                byteSize: this.maxParticles * 4,
            });
        }
        this.scan ??= new PrefixSum(this.core, {
            discriminator: `ns_scan:${this.disc}`,
            capacity: this.cellCount,
        });
        if (this.sortedParticlesBuffer === null) {
            this.sortedParticlesBuffer = this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `ns_sorted:${this.disc}`,
                byteSize: this.maxParticles * 4,
            });
        }
        if (this.neighborListBuffer === null) {
            this.neighborListBuffer = this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `ns_nlist:${this.disc}`,
                byteSize: this.maxParticles * this.maxNeighbors * 4,
            });
        }
        if (this.neighborCountBuffer === null) {
            this.neighborCountBuffer = this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `ns_ncount:${this.disc}`,
                byteSize: this.maxParticles * 4,
            });
        }
    }

    /** Libera kernels, buffers e uniforms. A instância pode ser reutilizada (realoca no próximo uso). */
    dispose(): void {
        this.releaseParticleKernels();
        if (this.scatterKernel !== null) destroyComputeKernel(this.core, this.scatterKernel);
        this.scatterKernel = null;
        this.scan?.destroy();
        this.scan = null;
        const buffers = [
            this.paramsBuffer,
            this.cellCountBuffer,
            this.cellStartBuffer,
            this.cellCursorBuffer,
            this.cellIdsBuffer,
            this.sortedParticlesBuffer,
            this.neighborListBuffer,
            this.neighborCountBuffer,
        ];
        for (const b of buffers) if (b !== null) this.core.destroy(b);
        this.paramsBuffer = null;
        this.cellCountBuffer = null;
        this.cellStartBuffer = null;
        this.cellCursorBuffer = null;
        this.cellIdsBuffer = null;
        this.sortedParticlesBuffer = null;
        this.neighborListBuffer = null;
        this.neighborCountBuffer = null;
        this.currentParticlesBuffer = null;
        this.uploadedParticleCount = -1;
    }

    /**
     * Prepara a busca para o buffer de partículas `particlesBuffer` e até `rebuildsPerFrame` reconstruções por quadro:
     * buffers da grade, kernels e a soma de prefixos. Idempotente; fora da gravação (numa transição do Flow — ex.: o
     * pool de partículas cresceu ou o número de passos do quadro mudou).
     */
    prepare(particlesBuffer: PoolBufferSpec, rebuildsPerFrame = 1): void {
        this.allocate();
        this.scan!.prepare(this.cellStartBuffer!, rebuildsPerFrame);
        if (this.currentParticlesBuffer !== particlesBuffer) {
            this.releaseParticleKernels();
            this.currentParticlesBuffer = particlesBuffer;
        }
        const nsParams = this.paramsBuffer!;
        this.assignKernel ??= createComputeKernel(this.core, {
            discriminator: `ns_assign:${this.disc}`,
            shader: nsAssignCount,
            entryPoint: 'ns_assign_count_main',
            bindings: {
                ns_params: nsParams,
                particle_data: particlesBuffer,
                cell_ids: this.cellIdsBuffer!,
                cell_count: this.cellCountBuffer!,
            },
        });
        this.scatterKernel ??= createComputeKernel(this.core, {
            discriminator: `ns_scatter:${this.disc}`,
            shader: nsScatter,
            entryPoint: 'ns_scatter_main',
            bindings: {
                ns_params: nsParams,
                cell_ids: this.cellIdsBuffer!,
                cell_cursor: this.cellCursorBuffer!,
                sorted_particles: this.sortedParticlesBuffer!,
            },
        });
        this.findKernel ??= createComputeKernel(this.core, {
            discriminator: `ns_find:${this.disc}`,
            shader: nsFind,
            entryPoint: 'ns_find_main',
            bindings: {
                ns_params: nsParams,
                particle_data: particlesBuffer,
                cell_start: this.cellStartBuffer!,
                cell_count_buf: this.cellCountBuffer!,
                sorted_particles: this.sortedParticlesBuffer!,
                neighbor_list: this.neighborListBuffer!,
                neighbor_count: this.neighborCountBuffer!,
            },
        });
    }

    /**
     * Escreve `NsSimParams` quando a contagem muda. Os parâmetros são os mesmos em todas as reconstruções do
     * quadro, então uma escrita (que entra na fila antes do quadro — research A1) vale para todas.
     */
    private uploadParams(particleCount: number): void {
        if (this.paramsBuffer === null || this.uploadedParticleCount === particleCount) return;
        this.uploadedParticleCount = particleCount;
        this.core.write(
            this.paramsBuffer,
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
            }),
        );
    }

    /**
     * Buffer de neighbor indices flat — `neighborList[p*maxNeighbors + n]`
     * dá o índice da n-ésima partícula vizinha de p (até `neighborCount[p]`).
     * Null antes de `rebuild` ser chamado pela primeira vez.
     */
    get neighborList(): StorageBufferSpec | null {
        return this.neighborListBuffer;
    }

    /**
     * Buffer de contadores — `neighborCount[p]` é o número de vizinhos
     * encontrados para a partícula p (≤ maxNeighbors).
     */
    get neighborCount(): StorageBufferSpec | null {
        return this.neighborCountBuffer;
    }

    /**
     * Grava a reconstrução das listas de vizinhos para as `particleCount` partículas do buffer preparado (`prepare`).
     * `particleCount = 0` não grava nada.
     *
     * Sequência: assign_count → soma de prefixos (cellCount → cellStart) → copy(cellStart, cellCursor) → scatter →
     * find.
     * @throws Error se `prepare` não foi chamado.
     */
    rebuild(frame: Frame, particleCount: number): void {
        if (particleCount === 0) return;
        const assign = this.assignKernel;
        const scan = this.scan;
        const scatter = this.scatterKernel;
        const find = this.findKernel;
        if (assign === null || scan === null || scatter === null || find === null) {
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
        const run = (label: string, k: ComputeKernel, invocations: number): void => {
            frame.compute(label, (pass) => {
                pass.bind.setPipeline(k.pipeline);
                k.bindGroups.forEach((bg, i) => pass.bind.setBindGroup(i, bg));
                pass.dispatch.invocations(invocations, 64);
            });
        };
        run('NS.assign_count', assign, particleCount);
        scan.record(frame, { src: cellCount, dst: cellStart, count: this.cellCount });
        // cell_cursor recebe cópia de cell_start: scatter usa atomicAdd em
        // cell_cursor para alocar o slot dentro do range [start, start+count).
        frame.copy(cellStart, this.cellCursorBuffer!, this.cellCount * 4);
        run('NS.scatter', scatter, particleCount);
        run('NS.find', find, particleCount);
    }
}
