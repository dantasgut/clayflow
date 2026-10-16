import type { WgslResource } from '../../../scene/shaders/WgslResource';
import type { BindingSource } from '../../../scene/flows/FlowBinding';
import type { EngineCore, Frame, StorageBufferSpec } from '../../../scene/contracts/gpu';
import type { ComputeKernel } from '../../../scene/flows/createComputeKernel';
import {
    createComputeKernel,
    destroyComputeKernel,
} from '../../../scene/flows/createComputeKernel';
import { FrameUniforms } from './FrameUniforms';
import { PrefixSum, SCAN_GROUP } from './PrefixSum';
import { RadixParamsSchema } from './schemas';
import { radixHistogram, radixScatter, radixResources } from './shaders';

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
    /** Chaves `u32[count]`, ordenadas no lugar (crescente); preparadas antes (`prepare`). */
    readonly keys: StorageBufferSpec;
    /** Valores `u32[count]` permutados junto com as chaves (exige `withValues`). */
    readonly values?: StorageBufferSpec;
    /** Elementos (≤ `capacity`). `0` não grava nada. */
    readonly count: number;
    /** Bits menos significativos considerados: múltiplo de 4 em [4, 32]. Padrão 32. */
    readonly bits?: number;
}

/** Kernels de um sentido do pingue-pongue. */
interface PassKernels {
    readonly histogram: ComputeKernel;
    readonly scatter: ComputeKernel;
}

/** Kernels preparados para um buffer de chaves (e valores): do chamador para o temporário e de volta. */
interface PreparedKeys {
    readonly values: StorageBufferSpec | undefined;
    readonly fromCaller: PassKernels;
    readonly fromTemp: PassKernels;
}

/** Passes de 4 bits de uma ordenação de 32 bits. */
const MAX_PASSES = 32 / DIGIT_BITS;

/**
 * Ordenação radix LSD estável de chaves u32 (research R9 da 005), com valores u32 opcionais. Cada passe de 4 bits:
 * histograma dos 16 dígitos por grupo de 256 (dígito-maior), soma de prefixos exclusiva dele (`PrefixSum`) — a base
 * global de cada (dígito, grupo) — e espalhamento estável. Sem atômicos na saída: o resultado é determinístico.
 *
 * Os passes alternam entre o buffer do chamador e um temporário interno (pingue-pongue); com número ímpar de passes,
 * o resultado é copiado de volta, então ele sempre termina em `keys` (e `values`).
 *
 * Duas fases (spec 006): `prepare(keys, values, gravaçõesPorQuadro)` fora da gravação; `record` só grava.
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
    private readonly prepared = new Map<StorageBufferSpec, PreparedKeys>();

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

    /**
     * Prepara a ordenação de `keys` (e `values`, com `withValues`) para até `recordsPerFrame` gravações por quadro.
     * Idempotente; fora da gravação.
     */
    prepare(keys: StorageBufferSpec, values?: StorageBufferSpec, recordsPerFrame = 1): void {
        this.checkValues(values);
        if (this.params.reserve(MAX_PASSES * recordsPerFrame)) this.releaseKernels();
        this.allocate();
        this.scan.prepare(this.hist!, MAX_PASSES * recordsPerFrame);
        const cached = this.prepared.get(keys);
        if (cached !== undefined && cached.values === values) return;
        if (cached !== undefined) this.destroyPrepared(cached);
        const tmpKeys = this.tmpKeys!;
        this.prepared.set(keys, {
            values,
            fromCaller: this.passKernels(
                keys,
                tmpKeys,
                values === undefined ? undefined : [values, this.tmpValues!],
            ),
            fromTemp: this.passKernels(
                tmpKeys,
                keys,
                values === undefined ? undefined : [this.tmpValues!, values],
            ),
        });
    }

    /**
     * Grava a ordenação de `keys[0, count)` (e `values`) no lugar.
     * @throws Error se (`keys`, `values`) não foi preparado.
     */
    record(frame: Frame, args: RadixSortRecordArgs): void {
        const { keys, values, count } = args;
        const bits = args.bits ?? 32;
        if (!Number.isInteger(bits) || bits < DIGIT_BITS || bits > 32 || bits % DIGIT_BITS !== 0) {
            throw new RangeError(
                `RadixSort(${this.disc}): bits deve ser múltiplo de 4 em [4, 32] (recebeu ${bits}).`,
            );
        }
        this.checkValues(values);
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
        const prepared = this.prepared.get(keys);
        if (prepared === undefined || prepared.values !== values) {
            throw new Error(`RadixSort(${this.disc}): prepare(keys, values) antes de gravar.`);
        }
        const groups = Math.ceil(count / SCAN_GROUP);
        const passes = bits / DIGIT_BITS;
        const hist = this.hist!;
        for (let p = 0; p < passes; p++) {
            const offset = this.params.allocate(frame, { count, shift: p * DIGIT_BITS, groups });
            const kernels = p % 2 === 0 ? prepared.fromCaller : prepared.fromTemp;
            this.run(frame, 'RadixSort.histogram', kernels.histogram, offset, count);
            this.scan.record(frame, { src: hist, dst: hist, count: DIGITS * groups });
            this.run(frame, 'RadixSort.scatter', kernels.scatter, offset, count);
        }
        if (passes % 2 === 1) {
            frame.copy(this.tmpKeys!, keys, count * 4);
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
    }

    private checkValues(values: StorageBufferSpec | undefined): void {
        if (values !== undefined && !this.withValues) {
            throw new Error(
                `RadixSort(${this.disc}): values exige a instância criada com withValues.`,
            );
        }
        if (values === undefined && this.withValues) {
            throw new Error(`RadixSort(${this.disc}): instância withValues — informe values.`);
        }
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
        const radix = this.params.source();
        const hist = this.hist!;
        const r = radixResources;
        const histogram = createComputeKernel(this.core, {
            discriminator: `${this.disc}:radix_histogram`,
            shader: radixHistogram,
            entryPoint: 'radix_histogram_main',
            bindings: new Map<WgslResource, BindingSource>([
                [r.radix, radix],
                [r.keys, inKeys],
                [r.histWrite, hist],
            ]),
        });
        const scatter = createComputeKernel(this.core, {
            discriminator: `${this.disc}:radix_scatter${valuePair === undefined ? '' : '_kv'}`,
            shader: radixScatter,
            entryPoint: valuePair === undefined ? 'radix_scatter_main' : 'radix_scatter_kv_main',
            bindings: new Map<WgslResource, BindingSource>([
                [r.radix, radix],
                [r.keysIn, inKeys],
                [r.keysOut, outKeys],
                [r.histRead, hist],
                ...(valuePair === undefined
                    ? []
                    : ([
                          [r.valuesIn, valuePair[0]],
                          [r.valuesOut, valuePair[1]],
                      ] as [WgslResource, BindingSource][])),
            ]),
        });
        return { histogram, scatter };
    }

    private run(
        frame: Frame,
        label: string,
        kernel: ComputeKernel,
        offset: number,
        count: number,
    ): void {
        frame.compute(label, (pass) => {
            pass.bind.setPipeline(kernel.pipeline);
            kernel.bindTo(pass.bind, { draw: [offset] });
            pass.dispatch.invocations(count, SCAN_GROUP);
        });
    }

    private destroyPrepared(p: PreparedKeys): void {
        for (const k of [p.fromCaller, p.fromTemp]) {
            destroyComputeKernel(this.core, k.histogram);
            destroyComputeKernel(this.core, k.scatter);
        }
    }

    private releaseKernels(): void {
        for (const p of this.prepared.values()) this.destroyPrepared(p);
        this.prepared.clear();
    }
}
