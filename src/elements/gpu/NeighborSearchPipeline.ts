import type {
    EngineCore,
    Frame,
    StorageBufferSpec,
    UniformBufferSpec,
} from '../../core/contracts/index';
import {
    createComputeKernel,
    destroyComputeKernel,
    type ComputeKernel,
} from '../../scene/flows/createComputeKernel';
import nsSimParamsStruct from './wgsl/structs/ns_sim_params.wgsl?raw';
import nsScanLevelStruct from './wgsl/structs/ns_scan_level.wgsl?raw';
import nsAssignCount from './wgsl/kernels/ns_assign_count.wgsl?raw';
import nsScanLocal from './wgsl/kernels/ns_scan_local.wgsl?raw';
import nsScanGroups from './wgsl/kernels/ns_scan_groups.wgsl?raw';
import nsScanCombine from './wgsl/kernels/ns_scan_combine.wgsl?raw';
import nsScatter from './wgsl/kernels/ns_scatter.wgsl?raw';
import nsFind from './wgsl/kernels/ns_find.wgsl?raw';

/** Teto de vizinhos por partícula: tamanho do vetor local em que `ns_find` ordena a lista (`NS_MAX_NEIGHBORS`). */
export const MAX_NEIGHBORS = 128;

/** Elementos por grupo da soma de prefixos (tamanho do workgroup dos kernels de scan). */
const SCAN_GROUP = 256;

/**
 * Contagens de cada nível da soma de prefixos hierárquica para `cells` células: `n_0 = cells`,
 * `n_{l+1} = ⌈n_l / 256⌉`, até um nível com ≤ 256 elementos (o topo, escaneado num grupo único). Sempre há ao
 * menos um nível abaixo do topo. Sem teto de células (spec 004, R17).
 */
export function scanLevelCounts(cells: number): number[] {
    const counts = [cells];
    do {
        counts.push(Math.ceil(counts[counts.length - 1]! / SCAN_GROUP));
    } while (counts[counts.length - 1]! > SCAN_GROUP);
    return counts;
}

/** Recursos de um nível da soma de prefixos. */
interface ScanLevel {
    /** Uniform `NsScanLevel` com a contagem do nível. */
    readonly uniform: UniformBufferSpec;
    /** Contagem de elementos do nível. */
    readonly count: number;
}

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
 * hashing + parallel prefix scan + scatter. Pipeline com 6 kernels:
 *   1. `assign_count`: cada partícula computa cell index + atomicAdd em cellCount.
 *   2. soma de prefixos hierárquica cellCount → cellStart (offsets por cell): `scan_local` sobe nível a
 *      nível (totais por grupo de 256), `scan_groups` escaneia o topo num grupo, `scan_combine` desce somando o
 *      prefixo do grupo — qualquer número de células (spec 004, R17).
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
    /** Uniform de contagem por nível (0..L) — escritos na alocação; a grade é fixa por instância. */
    private scanLevels: ScanLevel[] = [];
    /** Totais por grupo de cada nível acima do 0 (`sums[k-1]` = nível k, k = 1..L). */
    private scanSums: StorageBufferSpec[] = [];
    /** Somas parciais dos níveis intermediários (`partials[k-1]` = nível k, k = 1..L-1). */
    private scanPartials: StorageBufferSpec[] = [];
    private sortedParticlesBuffer: StorageBufferSpec | null = null;
    private neighborListBuffer: StorageBufferSpec | null = null;
    private neighborCountBuffer: StorageBufferSpec | null = null;

    private assignKernel: ComputeKernel | null = null;
    /** Por nível abaixo do topo: scan local (subida) e combine (descida). */
    private scanLocalKernels: ComputeKernel[] = [];
    private scanTopKernel: ComputeKernel | null = null;
    private scanCombineKernels: ComputeKernel[] = [];
    private scatterKernel: ComputeKernel | null = null;
    private findKernel: ComputeKernel | null = null;

    /** Contagem escrita em `NsSimParams` (-1 = ainda não escrito). */
    private uploadedParticleCount = -1;
    private currentParticlesBuffer: StorageBufferSpec | null = null;

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

    private base(): string {
        return nsSimParamsStruct;
    }

    /**
     * Invalida bind groups que dependem do particles buffer atual.
     * Chamado por SPHFlow/PBFFlow quando o pool de partículas reallocate.
     */
    invalidateParticlesBinding(): void {
        this.releaseParticleKernels();
        this.currentParticlesBuffer = null;
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
                byteSize: 48,
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
        if (this.scanLevels.length === 0) this.allocateScanLevels();
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

    /** Uniforms e buffers de todos os níveis da soma de prefixos; contagens escritas uma vez. */
    private allocateScanLevels(): void {
        const counts = scanLevelCounts(this.cellCount);
        const top = counts.length - 1;
        this.scanLevels = counts.map((count, k) => {
            const uniform = this.core.create<UniformBufferSpec>({
                kind: 'buffer',
                subkind: 'uniform',
                discriminator: `ns_scan_level:${this.disc}:${k}`,
                byteSize: 16,
            });
            this.core.write(uniform, new Uint32Array([count, 0, 0, 0]));
            return { uniform, count };
        });
        const storage = (name: string, k: number): StorageBufferSpec =>
            this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `${name}:${this.disc}:${k}`,
                byteSize: Math.max(16, counts[k]! * 4),
            });
        this.scanSums = counts.slice(1).map((_, i) => storage('ns_scan_sums', i + 1));
        this.scanPartials = counts.slice(1, top).map((_, i) => storage('ns_scan_partial', i + 1));
    }

    /** Kernels da soma de prefixos: mesmos pipelines em todos os níveis, um bind group por nível. */
    private ensureScanKernels(cellCount: StorageBufferSpec, cellStart: StorageBufferSpec): void {
        if (this.scanTopKernel !== null) return;
        const top = this.scanLevels.length - 1;
        const levelGroup = (k: number) => ({
            bindings: [
                { binding: 0, type: 'uniform' as const, buffer: this.scanLevels[k]!.uniform },
            ],
        });
        // Nível k: entrada (k = 0: contagens; k ≥ 1: totais do nível k), saída parcial e totais do nível k+1.
        const input = (k: number): StorageBufferSpec =>
            k === 0 ? cellCount : this.scanSums[k - 1]!;
        const partial = (k: number): StorageBufferSpec =>
            k === 0 ? cellStart : this.scanPartials[k - 1]!;
        // Prefixo do grupo para descer ao nível k: o nível k+1 já resolvido (o topo é escaneado no lugar).
        const prefix = (k: number): StorageBufferSpec =>
            k + 1 === top ? this.scanSums[top - 1]! : this.scanPartials[k]!;
        const localSrc = nsScanLevelStruct + '\n' + nsScanLocal;
        const combineSrc = nsScanLevelStruct + '\n' + nsScanCombine;
        for (let k = 0; k < top; k++) {
            this.scanLocalKernels.push(
                createComputeKernel(this.core, {
                    discriminator: `ns_scan_local:${this.disc}`,
                    shaderSource: localSrc,
                    entryPoint: 'ns_scan_local_main',
                    bindGroups: [
                        levelGroup(k),
                        {
                            bindings: [
                                {
                                    binding: 0,
                                    type: 'read-only-storage' as const,
                                    buffer: input(k),
                                },
                                { binding: 1, type: 'storage' as const, buffer: partial(k) },
                                { binding: 2, type: 'storage' as const, buffer: this.scanSums[k]! },
                            ],
                        },
                    ],
                }),
            );
            this.scanCombineKernels.push(
                createComputeKernel(this.core, {
                    discriminator: `ns_scan_combine:${this.disc}`,
                    shaderSource: combineSrc,
                    entryPoint: 'ns_scan_combine_main',
                    bindGroups: [
                        levelGroup(k),
                        {
                            bindings: [
                                { binding: 0, type: 'storage' as const, buffer: partial(k) },
                                {
                                    binding: 1,
                                    type: 'read-only-storage' as const,
                                    buffer: prefix(k),
                                },
                            ],
                        },
                    ],
                }),
            );
        }
        this.scanTopKernel = createComputeKernel(this.core, {
            discriminator: `ns_scan_groups:${this.disc}`,
            shaderSource: nsScanLevelStruct + '\n' + nsScanGroups,
            entryPoint: 'ns_scan_groups_main',
            bindGroups: [
                levelGroup(top),
                {
                    bindings: [
                        { binding: 0, type: 'storage' as const, buffer: this.scanSums[top - 1]! },
                    ],
                },
            ],
        });
    }

    /** Libera kernels, buffers e uniforms. A instância pode ser reutilizada (realoca no próximo uso). */
    dispose(): void {
        this.releaseParticleKernels();
        const kernels = [
            ...this.scanLocalKernels,
            ...this.scanCombineKernels,
            this.scanTopKernel,
            this.scatterKernel,
        ];
        for (const k of kernels) if (k !== null) destroyComputeKernel(this.core, k);
        this.scanLocalKernels = [];
        this.scanCombineKernels = [];
        this.scanTopKernel = null;
        this.scatterKernel = null;
        const buffers = [
            this.paramsBuffer,
            this.cellCountBuffer,
            this.cellStartBuffer,
            this.cellCursorBuffer,
            this.cellIdsBuffer,
            this.sortedParticlesBuffer,
            this.neighborListBuffer,
            this.neighborCountBuffer,
            ...this.scanSums,
            ...this.scanPartials,
            ...this.scanLevels.map((l) => l.uniform),
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
        this.scanSums = [];
        this.scanPartials = [];
        this.scanLevels = [];
        this.currentParticlesBuffer = null;
        this.uploadedParticleCount = -1;
    }

    private ensureKernels(particlesBuffer: StorageBufferSpec): void {
        if (this.currentParticlesBuffer !== particlesBuffer) {
            // Particles buffer mudou — invalida kernels que o referenciam.
            this.releaseParticleKernels();
            this.currentParticlesBuffer = particlesBuffer;
        }

        if (
            this.paramsBuffer === null
            || this.cellCountBuffer === null
            || this.cellStartBuffer === null
            || this.cellCursorBuffer === null
            || this.cellIdsBuffer === null
            || this.sortedParticlesBuffer === null
            || this.neighborListBuffer === null
            || this.neighborCountBuffer === null
        )
            return;

        const b = this.base();
        const paramsGroup = {
            bindings: [{ binding: 0, type: 'uniform' as const, buffer: this.paramsBuffer }],
        };

        if (this.assignKernel === null) {
            this.assignKernel = createComputeKernel(this.core, {
                discriminator: `ns_assign:${this.disc}`,
                shaderSource: b + '\n' + nsAssignCount,
                entryPoint: 'ns_assign_count_main',
                bindGroups: [
                    paramsGroup,
                    {
                        bindings: [
                            {
                                binding: 0,
                                type: 'read-only-storage' as const,
                                buffer: particlesBuffer,
                            },
                            {
                                binding: 1,
                                type: 'storage' as const,
                                buffer: this.cellIdsBuffer,
                            },
                        ],
                    },
                    {
                        bindings: [
                            { binding: 0, type: 'storage' as const, buffer: this.cellCountBuffer },
                        ],
                    },
                ],
            });
        }
        this.ensureScanKernels(this.cellCountBuffer, this.cellStartBuffer);
        if (this.scatterKernel === null) {
            this.scatterKernel = createComputeKernel(this.core, {
                discriminator: `ns_scatter:${this.disc}`,
                shaderSource: b + '\n' + nsScatter,
                entryPoint: 'ns_scatter_main',
                bindGroups: [
                    paramsGroup,
                    {
                        bindings: [
                            {
                                binding: 0,
                                type: 'read-only-storage' as const,
                                buffer: this.cellIdsBuffer,
                            },
                            {
                                binding: 1,
                                type: 'storage' as const,
                                buffer: this.cellCursorBuffer,
                            },
                            {
                                binding: 2,
                                type: 'storage' as const,
                                buffer: this.sortedParticlesBuffer,
                            },
                        ],
                    },
                ],
            });
        }
        if (this.findKernel === null) {
            this.findKernel = createComputeKernel(this.core, {
                discriminator: `ns_find:${this.disc}`,
                shaderSource: b + '\n' + nsFind,
                entryPoint: 'ns_find_main',
                bindGroups: [
                    paramsGroup,
                    {
                        bindings: [
                            {
                                binding: 0,
                                type: 'read-only-storage' as const,
                                buffer: particlesBuffer,
                            },
                            {
                                binding: 1,
                                type: 'read-only-storage' as const,
                                buffer: this.cellStartBuffer,
                            },
                            {
                                binding: 2,
                                type: 'read-only-storage' as const,
                                buffer: this.cellCountBuffer,
                            },
                            {
                                binding: 3,
                                type: 'read-only-storage' as const,
                                buffer: this.sortedParticlesBuffer,
                            },
                            {
                                binding: 4,
                                type: 'storage' as const,
                                buffer: this.neighborListBuffer,
                            },
                            {
                                binding: 5,
                                type: 'storage' as const,
                                buffer: this.neighborCountBuffer,
                            },
                        ],
                    },
                ],
            });
        }
    }

    /**
     * Escreve `NsSimParams` quando a contagem muda. Os parâmetros são os mesmos em todas as reconstruções do
     * quadro, então uma escrita (que entra na fila antes do quadro — research A1) vale para todas.
     */
    private uploadParams(particleCount: number): void {
        if (this.paramsBuffer === null || this.uploadedParticleCount === particleCount) return;
        this.uploadedParticleCount = particleCount;
        const buf = new ArrayBuffer(48);
        const f32 = new Float32Array(buf);
        const u32 = new Uint32Array(buf);
        f32[0] = this.origin[0];
        f32[1] = this.origin[1];
        f32[2] = this.origin[2];
        f32[3] = this.cellSize;
        u32[4] = this.gridDim[0];
        u32[5] = this.gridDim[1];
        u32[6] = this.gridDim[2];
        u32[7] = this.cellCount;
        u32[8] = particleCount;
        u32[9] = this.particleStrideF32;
        u32[10] = this.maxNeighbors;
        u32[11] = 0;
        this.core.write(this.paramsBuffer, new Uint8Array(buf));
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
     * Reconstrói os buffers de vizinhos para o estado atual de partículas.
     * Chamado uma vez por frame (no início do dispatch do flow consumidor).
     * Se particleCount=0, no-op.
     *
     * Sequência de kernels: assign_count → scan_local → scan_groups →
     * scan_combine → copy(cellStart, cellCursor) → scatter → find.
     */
    rebuild(frame: Frame, particlesBuffer: StorageBufferSpec, particleCount: number): void {
        if (particleCount === 0) return;
        this.allocate();
        this.ensureKernels(particlesBuffer);
        const assign = this.assignKernel;
        const scanTop = this.scanTopKernel;
        const scatter = this.scatterKernel;
        const find = this.findKernel;
        if (
            assign === null
            || scanTop === null
            || scatter === null
            || find === null
            || this.cellCountBuffer === null
            || this.neighborCountBuffer === null
            || this.cellStartBuffer === null
            || this.cellCursorBuffer === null
        )
            return;

        this.uploadParams(particleCount);
        // Zeradas no fluxo de comandos: cada reconstrução do quadro começa de contagens nulas.
        frame.clear(this.cellCountBuffer, 0, this.cellCount * 4);
        frame.clear(this.neighborCountBuffer, 0, particleCount * 4);

        const run = (
            label: string,
            k: ComputeKernel,
            invocations: number,
            groupSize: number,
        ): void => {
            frame.compute(label, (pass) => {
                pass.bind.setPipeline(k.pipeline);
                k.bindGroups.forEach((bg, i) => {
                    pass.bind.setBindGroup(i, bg);
                });
                pass.dispatch.invocations(invocations, groupSize);
            });
        };

        run('NS.assign_count', assign, particleCount, 64);
        // Soma de prefixos: sobe (totais por grupo), escaneia o topo, desce somando o prefixo do grupo.
        const top = this.scanLevels.length - 1;
        for (let k = 0; k < top; k++) {
            run('NS.scan_local', this.scanLocalKernels[k]!, this.scanLevels[k]!.count, SCAN_GROUP);
        }
        frame.compute('NS.scan_groups', (pass) => {
            pass.bind.setPipeline(scanTop.pipeline);
            scanTop.bindGroups.forEach((bg, i) => {
                pass.bind.setBindGroup(i, bg);
            });
            pass.dispatch.workgroups(1);
        });
        for (let k = top - 1; k >= 0; k--) {
            run(
                'NS.scan_combine',
                this.scanCombineKernels[k]!,
                this.scanLevels[k]!.count,
                SCAN_GROUP,
            );
        }
        // cell_cursor recebe cópia de cell_start: scatter usa atomicAdd em
        // cell_cursor para alocar o slot dentro do range [start, start+count).
        frame.copy(this.cellStartBuffer, this.cellCursorBuffer, this.cellCount * 4);
        run('NS.scatter', scatter, particleCount, 64);
        run('NS.find', find, particleCount, 64);
    }
}
