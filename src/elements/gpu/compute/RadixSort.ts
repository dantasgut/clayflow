import type {
    ComputeKernelBinding,
    EngineCore,
    Frame,
    StorageBufferSpec,
} from '../../../core/contracts/index';
import type { ComputeKernel } from '../../../scene/flows/createComputeKernel';
import {
    createComputeKernel,
    destroyComputeKernel,
} from '../../../scene/flows/createComputeKernel';
import { FrameUniforms } from './FrameUniforms';
import { PrefixSum, SCAN_GROUP } from './PrefixSum';
import { RadixParamsSchema } from './schemas';
import { radixHistogram, radixScatter } from './shaders';

/** Bits por passe (dígitos de 16 valores). */
const DIGIT_BITS = 4;
const DIGITS = 1 << DIGIT_BITS;

/** Opções de `RadixSort`. */
export interface RadixSortOptions {
    /** Prefixo único dos recursos da instância. */
    readonly discriminator: string;
    /** Maior `count` aceito por `record`. */
    readonly capacity: number;
    /** Permite ordenar valores junto com as chaves (aloca o buffer temporário dos valores). */
    readonly withValues?: boolean;
}

/** Argumentos de `RadixSort.record`. */
export interface RadixSortRecordArgs {
    /** Chaves `u32[count]`, ordenadas no lugar (crescente). */
    readonly keys: StorageBufferSpec;
    /** Valores `u32[count]` permutados junto com as chaves (exige `withValues`). */
    readonly values?: StorageBufferSpec;
    /** Elementos (≤ `capacity`). `0` não grava nada. */
    readonly count: number;
    /** Bits menos significativos considerados: múltiplo de 4 em [4, 32]. Padrão 32. */
    readonly bits?: number;
}

/** Kernels de um passe e os buffers a que estão ligados. */
interface PassKernels {
    readonly histogram: ComputeKernel;
    readonly scatter: ComputeKernel;
    readonly outKeys: StorageBufferSpec;
    readonly valuePair: readonly [StorageBufferSpec, StorageBufferSpec] | undefined;
}

/**
 * Ordenação radix LSD estável de chaves u32 (research R9), com valores u32 opcionais. Cada passe de 4 bits: histograma
 * dos 16 dígitos por grupo de 256 (dígito-maior), soma de prefixos exclusiva dele (`PrefixSum`) — a base global de cada
 * (dígito, grupo) — e espalhamento estável. Sem atômicos na saída: o resultado é determinístico.
 *
 * Os passes alternam entre o buffer do chamador e um temporário interno (pingue-pongue); com número ímpar de passes, o
 * resultado é copiado de volta, então ele sempre termina em `keys` (e `values`).
 */
export class RadixSort {
    private readonly disc: string;
    private readonly capacity: number;
    private readonly withValues: boolean;
    private readonly params: FrameUniforms;
    private readonly scan: PrefixSum;
    private tmpKeys: StorageBufferSpec | null = null;
    private tmpValues: StorageBufferSpec | null = null;
    private hist: StorageBufferSpec | null = null;
    /** Kernels por buffer de entrada do passe (chaves do chamador ou temporário). */
    private readonly kernels = new Map<StorageBufferSpec, PassKernels>();
    private kernelGeneration = -1;

    constructor(
        private readonly core: EngineCore,
        options: RadixSortOptions,
    ) {
        if (!Number.isInteger(options.capacity) || options.capacity < 1) {
            throw new RangeError(
                `RadixSort(${options.discriminator}): capacity deve ser inteiro ≥ 1 (recebeu ${options.capacity}).`,
            );
        }
        this.disc = options.discriminator;
        this.capacity = options.capacity;
        this.withValues = options.withValues === true;
        this.params = new FrameUniforms(core, {
            discriminator: `${this.disc}:radix`,
            schema: RadixParamsSchema,
        });
        this.scan = new PrefixSum(core, {
            discriminator: `${this.disc}:radix_scan`,
            capacity: DIGITS * Math.ceil(options.capacity / SCAN_GROUP),
        });
    }

    /** Grava a ordenação de `keys[0, count)` (e `values`) no lugar. */
    record(frame: Frame, args: RadixSortRecordArgs): void {
        const { keys, values, count } = args;
        const bits = args.bits ?? 32;
        if (!Number.isInteger(bits) || bits < DIGIT_BITS || bits > 32 || bits % DIGIT_BITS !== 0) {
            throw new RangeError(
                `RadixSort(${this.disc}): bits deve ser múltiplo de 4 em [4, 32] (recebeu ${bits}).`,
            );
        }
        if (values !== undefined && !this.withValues) {
            throw new Error(
                `RadixSort(${this.disc}): values exige a instância criada com withValues.`,
            );
        }
        if (values === undefined && this.withValues) {
            throw new Error(
                `RadixSort(${this.disc}): instância withValues — informe values em record.`,
            );
        }
        if (!Number.isInteger(count) || count < 0) {
            throw new RangeError(
                `RadixSort(${this.disc}): count deve ser inteiro ≥ 0 (recebeu ${count}).`,
            );
        }
        if (count > this.capacity) {
            throw new RangeError(
                `RadixSort(${this.disc}): count ${count} acima da capacidade ${this.capacity}.`,
            );
        }
        if (count === 0) return;

        this.allocate();
        const groups = Math.ceil(count / SCAN_GROUP);
        const passes = bits / DIGIT_BITS;
        const offsets: number[] = [];
        for (let p = 0; p < passes; p++) {
            offsets.push(this.params.allocate(frame, { count, shift: p * DIGIT_BITS, groups }));
        }
        if (this.kernelGeneration !== this.params.generation) this.releaseKernels();
        this.kernelGeneration = this.params.generation;

        const tmpKeys = this.tmpKeys!;
        const hist = this.hist!;
        let inKeys = keys;
        for (let p = 0; p < passes; p++) {
            const fromCaller = inKeys === keys;
            const pass = this.passKernels(
                inKeys,
                fromCaller ? tmpKeys : keys,
                values === undefined
                    ? undefined
                    : fromCaller
                      ? [values, this.tmpValues!]
                      : [this.tmpValues!, values],
            );
            this.run(frame, 'RadixSort.histogram', pass.histogram, offsets[p]!, count);
            this.scan.record(frame, { src: hist, dst: hist, count: DIGITS * groups });
            this.run(frame, 'RadixSort.scatter', pass.scatter, offsets[p]!, count);
            inKeys = fromCaller ? tmpKeys : keys;
        }
        if (inKeys !== keys) {
            frame.copy(tmpKeys, keys, count * 4);
            if (values !== undefined) frame.copy(this.tmpValues!, values, count * 4);
        }
    }

    /** Libera kernels, temporários, a soma de prefixos interna e os uniforms. */
    destroy(): void {
        this.releaseKernels();
        for (const b of [this.tmpKeys, this.tmpValues, this.hist]) {
            if (b !== null) this.core.destroy(b);
        }
        this.tmpKeys = null;
        this.tmpValues = null;
        this.hist = null;
        this.scan.destroy();
        this.params.destroy();
        this.kernelGeneration = -1;
    }

    private allocate(): void {
        const storage = (name: string, byteSize: number): StorageBufferSpec =>
            this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `${this.disc}:${name}`,
                byteSize: Math.max(16, byteSize),
            });
        this.tmpKeys ??= storage('radix_tmp_keys', this.capacity * 4);
        if (this.withValues) this.tmpValues ??= storage('radix_tmp_values', this.capacity * 4);
        this.hist ??= storage('radix_hist', DIGITS * Math.ceil(this.capacity / SCAN_GROUP) * 4);
    }

    private passKernels(
        inKeys: StorageBufferSpec,
        outKeys: StorageBufferSpec,
        valuePair: readonly [StorageBufferSpec, StorageBufferSpec] | undefined,
    ): PassKernels {
        const cached = this.kernels.get(inKeys);
        if (
            cached?.outKeys === outKeys
            && cached.valuePair?.[0] === valuePair?.[0]
            && cached.valuePair?.[1] === valuePair?.[1]
        ) {
            return cached;
        }
        if (cached !== undefined) {
            destroyComputeKernel(this.core, cached.histogram);
            destroyComputeKernel(this.core, cached.scatter);
        }
        const uniform = { bindings: [this.params.binding(0)] };
        const histogram = createComputeKernel(this.core, {
            discriminator: `${this.disc}:radix_histogram`,
            shader: radixHistogram,
            entryPoint: 'radix_histogram_main',
            bindGroups: [
                uniform,
                {
                    bindings: [
                        { binding: 0, type: 'read-only-storage', buffer: inKeys },
                        { binding: 1, type: 'storage', buffer: this.hist! },
                    ],
                },
            ],
        });
        const data: ComputeKernelBinding[] = [
            { binding: 0, type: 'read-only-storage', buffer: inKeys },
            { binding: 1, type: 'storage', buffer: outKeys },
            { binding: 2, type: 'read-only-storage', buffer: this.hist! },
        ];
        if (valuePair !== undefined) {
            data.push(
                { binding: 3, type: 'read-only-storage', buffer: valuePair[0] },
                { binding: 4, type: 'storage', buffer: valuePair[1] },
            );
        }
        const scatter = createComputeKernel(this.core, {
            discriminator: `${this.disc}:radix_scatter${valuePair === undefined ? '' : '_kv'}`,
            shader: radixScatter,
            entryPoint: valuePair === undefined ? 'radix_scatter_main' : 'radix_scatter_kv_main',
            bindGroups: [uniform, { bindings: data }],
        });
        const pass = { histogram, scatter, outKeys, valuePair };
        this.kernels.set(inKeys, pass);
        return pass;
    }

    private run(
        frame: Frame,
        label: string,
        kernel: ComputeKernel,
        offset: number,
        count: number,
    ): void {
        frame.compute(label, (pass) => {
            pass.bind
                .setPipeline(kernel.pipeline)
                .setBindGroup(0, kernel.bindGroups[0]!, [offset])
                .setBindGroup(1, kernel.bindGroups[1]!);
            pass.dispatch.invocations(count, SCAN_GROUP);
        });
    }

    private releaseKernels(): void {
        for (const pass of this.kernels.values()) {
            destroyComputeKernel(this.core, pass.histogram);
            destroyComputeKernel(this.core, pass.scatter);
        }
        this.kernels.clear();
    }
}
