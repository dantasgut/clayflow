import type {
    ComputeKernel,
    EngineCore,
    Frame,
    StorageBufferSpec,
} from '../../../core/contracts/index';
import {
    createComputeKernel,
    destroyComputeKernel,
} from '../../../scene/flows/createComputeKernel';
import { FrameUniforms } from './FrameUniforms';
import { SCAN_GROUP } from './PrefixSum';
import { ReduceLevelSchema } from './schemas';
import { reduceKernel, type ReduceOpName, type ReduceType } from './shaders';

/**
 * Contagens de cada nível da redução para `count` elementos: `n_0 = count`, `n_{l+1} = ⌈n_l / 256⌉`, até 1. Sempre há
 * ao menos um passe (`count = 1` → `[1, 1]`).
 */
export function reduceLevelCounts(count: number): number[] {
    const counts = [count];
    do {
        counts.push(Math.ceil(counts[counts.length - 1]! / SCAN_GROUP));
    } while (counts[counts.length - 1]! > 1);
    return counts;
}

/** Opções de `Reduce`. */
export interface ReduceOptions {
    /** Prefixo único dos recursos da instância. */
    readonly discriminator: string;
    /** Maior `count` aceito por `record`. */
    readonly capacity: number;
    /** Operação. */
    readonly op: ReduceOpName;
    /** Tipo dos elementos. */
    readonly type: ReduceType;
}

/** Argumentos de `Reduce.record`. */
export interface ReduceRecordArgs {
    /** Entrada `T[count]`. */
    readonly src: StorageBufferSpec;
    /** Elementos (≤ `capacity`). `0` não grava nada (a saída fica como está). */
    readonly count: number;
    /** Buffer de saída. */
    readonly out: StorageBufferSpec;
    /** Índice (em elementos) do resultado em `out`. Padrão 0. */
    readonly outOffset?: number;
}

/** Kernel de um passe e os buffers a que está ligado. */
interface PassKernel {
    readonly out: StorageBufferSpec;
    readonly kernel: ComputeKernel;
}

/**
 * Redução de `T[count]` a um valor (research R11): árvore por grupo de 256 em memória de workgroup, níveis até restar
 * um valor. Soma, mínimo ou máximo de u32, i32 ou f32 (módulo de operação `reduceOp`, memorizado). Soma de f32 tem
 * ordem de soma diferente da sequencial: tolerância relativa `1e-5 × log2(count)` (contrato).
 */
export class Reduce {
    private readonly disc: string;
    private readonly capacity: number;
    private readonly levelCapacity: readonly number[];
    private readonly params: FrameUniforms;
    private readonly shader: ReturnType<typeof reduceKernel>;
    /** Resultados parciais dos níveis intermediários (`partials[k - 1]` = nível k). */
    private partials: StorageBufferSpec[] | null = null;
    /** Kernels por buffer de entrada do passe. */
    private readonly kernels = new Map<StorageBufferSpec, PassKernel>();
    private kernelGeneration = -1;

    constructor(
        private readonly core: EngineCore,
        options: ReduceOptions,
    ) {
        if (!Number.isInteger(options.capacity) || options.capacity < 1) {
            throw new RangeError(
                `Reduce(${options.discriminator}): capacity deve ser inteiro ≥ 1 (recebeu ${options.capacity}).`,
            );
        }
        this.disc = options.discriminator;
        this.capacity = options.capacity;
        this.levelCapacity = reduceLevelCounts(options.capacity);
        this.shader = reduceKernel(options.op, options.type);
        this.params = new FrameUniforms(core, {
            discriminator: `${this.disc}:reduce`,
            schema: ReduceLevelSchema,
        });
    }

    /** Grava a redução de `src[0, count)` em `out[outOffset]`. */
    record(frame: Frame, args: ReduceRecordArgs): void {
        const { src, count, out } = args;
        const outOffset = args.outOffset ?? 0;
        if (!Number.isInteger(count) || count < 0) {
            throw new RangeError(
                `Reduce(${this.disc}): count deve ser inteiro ≥ 0 (recebeu ${count}).`,
            );
        }
        if (count > this.capacity) {
            throw new RangeError(
                `Reduce(${this.disc}): count ${count} acima da capacidade ${this.capacity}.`,
            );
        }
        if (!Number.isInteger(outOffset) || outOffset < 0) {
            throw new RangeError(
                `Reduce(${this.disc}): outOffset deve ser inteiro ≥ 0 (recebeu ${outOffset}).`,
            );
        }
        if (count === 0) return;
        const partials = (this.partials ??= this.allocate());

        const counts = reduceLevelCounts(count);
        const passes = counts.length - 1;
        const offsets = counts.slice(0, passes).map((n, k) =>
            this.params.allocate(frame, {
                count: n,
                out_index: k === passes - 1 ? outOffset : 0,
            }),
        );
        if (this.kernelGeneration !== this.params.generation) this.releaseKernels();
        this.kernelGeneration = this.params.generation;

        for (let k = 0; k < passes; k++) {
            const input = k === 0 ? src : partials[k - 1]!;
            const output = k === passes - 1 ? out : partials[k]!;
            const kernel = this.passKernel(input, output);
            frame.compute('Reduce', (pass) => {
                pass.bind
                    .setPipeline(kernel.pipeline)
                    .setBindGroup(0, kernel.bindGroups[0]!, [offsets[k]!])
                    .setBindGroup(1, kernel.bindGroups[1]!);
                pass.dispatch.invocations(counts[k]!, SCAN_GROUP);
            });
        }
    }

    /** Libera kernels, parciais e uniforms. */
    destroy(): void {
        this.releaseKernels();
        for (const b of this.partials ?? []) this.core.destroy(b);
        this.partials = null;
        this.params.destroy();
        this.kernelGeneration = -1;
    }

    /** Parciais dos níveis 1..L-1 pela capacidade (o último passe escreve na saída do chamador). */
    private allocate(): StorageBufferSpec[] {
        return this.levelCapacity.slice(1, -1).map((n, i) =>
            this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `${this.disc}:reduce_level:${i + 1}`,
                byteSize: Math.max(16, n * 4),
            }),
        );
    }

    private passKernel(input: StorageBufferSpec, output: StorageBufferSpec): ComputeKernel {
        const cached = this.kernels.get(input);
        if (cached?.out === output) return cached.kernel;
        if (cached !== undefined) destroyComputeKernel(this.core, cached.kernel);
        const kernel = createComputeKernel(this.core, {
            discriminator: `${this.disc}:reduce`,
            shader: this.shader,
            entryPoint: 'reduce_main',
            bindGroups: [
                { bindings: [this.params.binding(0)] },
                {
                    bindings: [
                        { binding: 0, type: 'read-only-storage', buffer: input },
                        { binding: 1, type: 'storage', buffer: output },
                    ],
                },
            ],
        });
        this.kernels.set(input, { out: output, kernel });
        return kernel;
    }

    private releaseKernels(): void {
        for (const { kernel } of this.kernels.values()) destroyComputeKernel(this.core, kernel);
        this.kernels.clear();
    }
}
