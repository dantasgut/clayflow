import type {
    EngineCore,
    Frame,
    StorageBufferSpec,
    UniformBufferSpec,
} from '../../core/contracts/index';
import { createComputeKernel, type ComputeKernel } from '../../scene/flows/createComputeKernel';
import nsSimParamsStruct from './wgsl/structs/ns_sim_params.wgsl?raw';
import nsAssignCount from './wgsl/kernels/ns_assign_count.wgsl?raw';
import nsScanLocal from './wgsl/kernels/ns_scan_local.wgsl?raw';
import nsScanGroups from './wgsl/kernels/ns_scan_groups.wgsl?raw';
import nsScanCombine from './wgsl/kernels/ns_scan_combine.wgsl?raw';
import nsScatter from './wgsl/kernels/ns_scatter.wgsl?raw';
import nsFind from './wgsl/kernels/ns_find.wgsl?raw';

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
 *   2. `scan_local` + `scan_groups` + `scan_combine`: prefix sum sobre
 *      cellCount → cellStart (offsets para cada cell).
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
    private groupSumsBuffer: StorageBufferSpec | null = null;
    private sortedParticlesBuffer: StorageBufferSpec | null = null;
    private neighborListBuffer: StorageBufferSpec | null = null;
    private neighborCountBuffer: StorageBufferSpec | null = null;

    private assignKernel: ComputeKernel | null = null;
    private scanLocalKernel: ComputeKernel | null = null;
    private scanGroupsKernel: ComputeKernel | null = null;
    private scanCombineKernel: ComputeKernel | null = null;
    private scatterKernel: ComputeKernel | null = null;
    private findKernel: ComputeKernel | null = null;

    private currentParticleCount = 0;
    private currentParticlesBuffer: StorageBufferSpec | null = null;

    constructor(
        private readonly core: EngineCore,
        options: NeighborSearchOptions,
    ) {
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
        this.assignKernel = null;
        this.findKernel = null;
        this.currentParticlesBuffer = null;
    }

    private ensureBuffers(): void {
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
        if (this.groupSumsBuffer === null) {
            const groups = Math.ceil(this.cellCount / 256);
            this.groupSumsBuffer = this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `ns_group_sums:${this.disc}`,
                byteSize: Math.max(256, groups) * 4,
            });
        }
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

    private ensureKernels(particlesBuffer: StorageBufferSpec): void {
        if (this.currentParticlesBuffer !== particlesBuffer) {
            // Particles buffer mudou — invalida kernels que o referenciam.
            this.assignKernel = null;
            this.findKernel = null;
            this.currentParticlesBuffer = particlesBuffer;
        }

        if (
            this.paramsBuffer === null
            || this.cellCountBuffer === null
            || this.cellStartBuffer === null
            || this.cellCursorBuffer === null
            || this.cellIdsBuffer === null
            || this.groupSumsBuffer === null
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
        if (this.scanLocalKernel === null) {
            this.scanLocalKernel = createComputeKernel(this.core, {
                discriminator: `ns_scan_local:${this.disc}`,
                shaderSource: b + '\n' + nsScanLocal,
                entryPoint: 'ns_scan_local_main',
                bindGroups: [
                    paramsGroup,
                    {
                        bindings: [
                            {
                                binding: 0,
                                type: 'read-only-storage' as const,
                                buffer: this.cellCountBuffer,
                            },
                            {
                                binding: 1,
                                type: 'storage' as const,
                                buffer: this.cellStartBuffer,
                            },
                            {
                                binding: 2,
                                type: 'storage' as const,
                                buffer: this.groupSumsBuffer,
                            },
                        ],
                    },
                ],
            });
        }
        if (this.scanGroupsKernel === null) {
            this.scanGroupsKernel = createComputeKernel(this.core, {
                discriminator: `ns_scan_groups:${this.disc}`,
                shaderSource: b + '\n' + nsScanGroups,
                entryPoint: 'ns_scan_groups_main',
                bindGroups: [
                    paramsGroup,
                    {
                        bindings: [
                            { binding: 0, type: 'storage' as const, buffer: this.groupSumsBuffer },
                        ],
                    },
                ],
            });
        }
        if (this.scanCombineKernel === null) {
            this.scanCombineKernel = createComputeKernel(this.core, {
                discriminator: `ns_scan_combine:${this.disc}`,
                shaderSource: b + '\n' + nsScanCombine,
                entryPoint: 'ns_scan_combine_main',
                bindGroups: [
                    paramsGroup,
                    {
                        bindings: [
                            { binding: 0, type: 'storage' as const, buffer: this.cellStartBuffer },
                            {
                                binding: 1,
                                type: 'read-only-storage' as const,
                                buffer: this.groupSumsBuffer,
                            },
                        ],
                    },
                ],
            });
        }
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

    private uploadParams(particleCount: number): void {
        if (this.paramsBuffer === null) return;
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

    private clearBuffer(buf: StorageBufferSpec, byteSize: number): void {
        const arr = new Uint8Array(byteSize);
        this.core.write(buf, arr);
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
        this.ensureBuffers();
        this.ensureKernels(particlesBuffer);
        const assign = this.assignKernel;
        const scanLocal = this.scanLocalKernel;
        const scanGroups = this.scanGroupsKernel;
        const scanCombine = this.scanCombineKernel;
        const scatter = this.scatterKernel;
        const find = this.findKernel;
        if (
            assign === null
            || scanLocal === null
            || scanGroups === null
            || scanCombine === null
            || scatter === null
            || find === null
            || this.cellCountBuffer === null
            || this.neighborCountBuffer === null
            || this.cellStartBuffer === null
            || this.cellCursorBuffer === null
        )
            return;

        this.uploadParams(particleCount);
        this.clearBuffer(this.cellCountBuffer, this.cellCount * 4);
        this.clearBuffer(this.neighborCountBuffer, particleCount * 4);
        this.currentParticleCount = particleCount;

        const partWg = Math.ceil(particleCount / 64);
        const cellWg = Math.ceil(this.cellCount / 256);
        const dispatchKernel = (label: string, k: ComputeKernel, wg: number): void => {
            frame.compute(label, (pass) => {
                pass.bind.setPipeline(k.pipeline);
                k.bindGroups.forEach((bg, i) => {
                    pass.bind.setBindGroup(i, bg);
                });
                pass.dispatch.workgroups(wg);
            });
        };

        dispatchKernel('NS.assign_count', assign, partWg);
        dispatchKernel('NS.scan_local', scanLocal, cellWg);
        dispatchKernel('NS.scan_groups', scanGroups, 1);
        dispatchKernel('NS.scan_combine', scanCombine, cellWg);
        // cell_cursor recebe cópia de cell_start: scatter usa atomicAdd em
        // cell_cursor para alocar o slot dentro do range [start, start+count).
        frame.copy(this.cellStartBuffer, this.cellCursorBuffer, this.cellCount * 4);
        dispatchKernel('NS.scatter', scatter, partWg);
        dispatchKernel('NS.find', find, partWg);
        void this.currentParticleCount;
    }
}
