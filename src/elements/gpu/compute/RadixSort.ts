import type { WgslResource } from '../../../scene/shaders/WgslResource';
import type { BindingSource } from '../../../scene/flows/FlowBinding';
import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { WorkContext, WorkPart } from '../../../scene/flows/FlowWork';
import type { Frame, IndirectBufferSpec, StorageBufferSpec } from '../../../scene/contracts/gpu';
import type { ComputeKernel } from '../../../scene/flows/createComputeKernel';
import type { ComputePass } from '../../../scene/contracts/gpu';
import {
    createComputeKernel,
    destroyComputeKernel,
} from '../../../scene/flows/createComputeKernel';
import { bindPoints } from '../../../scene/shaders/bindPoints';
import { CountToArgs, type GpuCount } from './CountToArgs';
import { FrameUniforms } from './FrameUniforms';
import { PrefixSum, SCAN_GROUP } from './PrefixSum';
import { RadixParamsSchema, wordBuffer } from './schemas';
import {
    radixCountGpu,
    radixCountPoint,
    radixHistogram,
    radixScatter,
    radixResources,
    setCountResources,
} from './shaders';

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
    /**
     * Elementos (≤ `capacity`). `0` não grava nada. Ou a contagem lida na GPU (`GpuCount`, com `keys` preparado com o
     * mesmo `counts`): o histograma cobre os grupos da capacidade e a contagem real limita os kernels.
     */
    readonly count: number | GpuCount;
    /** Bits menos significativos considerados: múltiplo de 4 em [4, 32]. Padrão 32. */
    readonly bits?: number;
    /**
     * Passe de compute já aberto: as passadas (histograma, soma de prefixos, espalhamento) são gravadas nele em vez de
     * cada despacho no seu passe — menos fronteiras de passe, o mesmo resultado. Exige contagem da CPU e número par de
     * passadas (`bits / 4` par: o resultado volta às chaves sem cópia).
     */
    readonly pass?: ComputePass;
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
 * Contagem da GPU (spec 031, R10): preparada com `counts`, a ordenação aceita `count: { counts, index }` — os
 * elementos vêm do registro `SetCount` no próprio kernel (ponto `radix_count`), sem leitura de volta. O histograma usa
 * os grupos da capacidade (os além da contagem real ficam zerados, sem mudar as bases) e despacha pela capacidade; a
 * soma de prefixos dele tem tamanho conhecido na CPU; o espalhamento despacha pelo argumento indireto do registro, que
 * precisa já trazer o despacho para grupos de 256 (`CountToArgs` com `workgroupSize: 256` gravado antes no mesmo
 * fluxo). Com número ímpar de passes, as chaves (e valores) são copiadas para o temporário antes e de volta depois,
 * pela capacidade (limitada pelos buffers) — a cauda além da contagem volta intacta. A contagem deve ser ≤ `capacity`.
 *
 * Duas fases (spec 006): `prepare(keys, values, gravaçõesPorQuadro, counts?)` fora da gravação; `record` só grava.
 * Os temporários e o histograma são descritores do Resource de trabalho (spec 039).
 */
export class RadixSort implements WorkPart {
    private readonly disc: string;
    private readonly capacity: number;
    private readonly withValues: boolean;
    private readonly params: FrameUniforms;
    private readonly scan: PrefixSum;
    /** `destroy()` soltou os descritores (a C2 libera os buffers); o próximo `prepare` os declara de novo. */
    private released = false;
    /** Kernels por origem da contagem (`null` = CPU; um buffer `SetCount` = variante da GPU) e buffer de chaves. */
    private readonly prepared = new Map<
        IndirectBufferSpec | null,
        Map<StorageBufferSpec, PreparedKeys>
    >();

    constructor(
        private readonly ctx: WorkContext,
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
        this.params = new FrameUniforms(ctx, {
            id: `${this.disc}:radix`,
            schema: RadixParamsSchema,
        });
        this.scan = new PrefixSum(ctx, {
            discriminator: `${this.disc}:radix_scan`,
            capacity: DIGITS * Math.ceil(options.capacity / SCAN_GROUP),
        });
        ctx.work.use(this);
    }

    /** Temporários do pingue-pongue (chaves e, com `withValues`, valores) e o histograma dos grupos. */
    descriptors(): readonly GPUDescriptor[] {
        if (this.released) return [];
        return [
            wordBuffer(`${this.disc}:radix_tmp_keys`, this.capacity * 4),
            ...(this.withValues
                ? [wordBuffer(`${this.disc}:radix_tmp_values`, this.capacity * 4)]
                : []),
            wordBuffer(
                `${this.disc}:radix_hist`,
                DIGITS * Math.ceil(this.capacity / SCAN_GROUP) * 4,
            ),
        ];
    }

    private buffer(name: string): StorageBufferSpec {
        const buffer = this.ctx.resources.bufferOf(this.ctx.work, `${this.disc}:${name}`);
        if (buffer === undefined)
            throw new Error(`RadixSort(${this.disc}): trabalho fora da cena.`);
        return buffer as StorageBufferSpec;
    }

    private get tmpKeys(): StorageBufferSpec {
        return this.buffer('radix_tmp_keys');
    }

    private get tmpValues(): StorageBufferSpec {
        return this.buffer('radix_tmp_values');
    }

    private get hist(): StorageBufferSpec {
        return this.buffer('radix_hist');
    }

    /**
     * Prepara a ordenação de `keys` (e `values`, com `withValues`) para até `recordsPerFrame` gravações por quadro.
     * Com `counts`, também os kernels da variante de contagem da GPU ligados a esse buffer de registros `SetCount`
     * (memorizados por buffer). Idempotente; fora da gravação.
     */
    prepare(
        keys: StorageBufferSpec,
        values?: StorageBufferSpec,
        recordsPerFrame = 1,
        counts?: IndirectBufferSpec,
    ): void {
        this.checkValues(values);
        if (this.released) {
            this.released = false;
            this.ctx.work.refresh();
        }
        if (this.params.reserve(MAX_PASSES * recordsPerFrame)) this.releaseKernels();
        this.scan.prepare(this.hist, MAX_PASSES * recordsPerFrame);
        const tmpKeys = this.tmpKeys;
        for (const source of counts === undefined ? [null] : [null, counts]) {
            let byKeys = this.prepared.get(source);
            if (byKeys === undefined) this.prepared.set(source, (byKeys = new Map()));
            const cached = byKeys.get(keys);
            if (cached !== undefined && cached.values === values) continue;
            if (cached !== undefined) this.destroyPrepared(cached);
            byKeys.set(keys, {
                values,
                fromCaller: this.passKernels(
                    source,
                    keys,
                    tmpKeys,
                    values === undefined ? undefined : [values, this.tmpValues],
                ),
                fromTemp: this.passKernels(
                    source,
                    tmpKeys,
                    keys,
                    values === undefined ? undefined : [this.tmpValues, values],
                ),
            });
        }
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
        if (typeof count !== 'number') {
            if (args.pass !== undefined)
                throw new Error(`RadixSort(${this.disc}): num passe aberto a contagem é da CPU.`);
            this.recordGpu(frame, args, bits, count);
            return;
        }
        if (args.pass !== undefined && (bits / DIGIT_BITS) % 2 === 1)
            throw new Error(
                `RadixSort(${this.disc}): num passe aberto o número de passadas é par.`,
            );
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
        const prepared = this.prepared.get(null)?.get(keys);
        if (prepared === undefined || prepared.values !== values) {
            throw new Error(`RadixSort(${this.disc}): prepare(keys, values) antes de gravar.`);
        }
        this.runPasses(frame, prepared, bits, count, count, 0, args.pass);
        if ((bits / DIGIT_BITS) % 2 === 1) this.copyBack(frame, args, count * 4);
    }

    /**
     * Variante de contagem da GPU: histograma pelos grupos da capacidade, espalhamento pelo despacho indireto do
     * registro `count`; com passes ímpares, as chaves (e valores) vão ao temporário antes, para a cauda voltar intacta.
     */
    private recordGpu(
        frame: Frame,
        args: RadixSortRecordArgs,
        bits: number,
        count: GpuCount,
    ): void {
        const owner = `RadixSort(${this.disc})`;
        CountToArgs.check(owner, count);
        const { keys, values } = args;
        const prepared = this.prepared.get(count.counts)?.get(keys);
        if (prepared === undefined || prepared.values !== values) {
            throw new Error(`${owner}: prepare(keys, values, gravações, counts) antes de gravar.`);
        }
        const odd = (bits / DIGIT_BITS) % 2 === 1;
        const limit = Math.min(this.capacity * 4, keys.byteSize, values?.byteSize ?? Infinity);
        const bytes = limit - (limit % 4);
        if (odd) {
            frame.copy(keys, this.tmpKeys, bytes);
            if (values !== undefined) frame.copy(values, this.tmpValues, bytes);
        }
        this.runPasses(frame, prepared, bits, this.capacity, count, count.index);
        if (odd) this.copyBack(frame, args, bytes);
    }

    /**
     * Passes de 4 bits: `count` elementos no uniform (a capacidade na variante da GPU, cujo kernel lê o registro) e
     * histograma pelos grupos dele; o espalhamento despacha `scatter` (as mesmas invocações, ou o indireto do registro).
     */
    private runPasses(
        frame: Frame,
        prepared: PreparedKeys,
        bits: number,
        count: number,
        scatter: number | GpuCount,
        countIndex: number,
        pass?: ComputePass,
    ): void {
        const groups = Math.ceil(count / SCAN_GROUP);
        const hist = this.hist;
        for (let p = 0; p < bits / DIGIT_BITS; p++) {
            const offset = this.params.allocate(frame, {
                count,
                shift: p * DIGIT_BITS,
                groups,
                count_index: countIndex,
            });
            const kernels = p % 2 === 0 ? prepared.fromCaller : prepared.fromTemp;
            this.run(frame, 'RadixSort.histogram', kernels.histogram, offset, count, pass);
            this.scan.record(frame, {
                src: hist,
                dst: hist,
                count: DIGITS * groups,
                ...(pass !== undefined ? { pass } : {}),
            });
            this.run(frame, 'RadixSort.scatter', kernels.scatter, offset, scatter, pass);
        }
    }

    /** Número ímpar de passes: o resultado, no temporário, volta às chaves (e valores) do chamador. */
    private copyBack(frame: Frame, args: RadixSortRecordArgs, bytes: number): void {
        frame.copy(this.tmpKeys, args.keys, bytes);
        if (args.values !== undefined) frame.copy(this.tmpValues, args.values, bytes);
    }

    /** Libera os kernels e solta os temporários e a soma interna (a C2 os libera); `prepare` os declara de novo. */
    destroy(): void {
        this.releaseKernels();
        this.scan.destroy();
        this.released = true;
        this.params.release();
        this.ctx.work.refresh();
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

    private passKernels(
        counts: IndirectBufferSpec | null,
        inKeys: StorageBufferSpec,
        outKeys: StorageBufferSpec,
        valuePair: readonly [StorageBufferSpec, StorageBufferSpec] | undefined,
    ): PassKernels {
        const radix = this.params.source();
        const hist = this.hist;
        const r = radixResources;
        const gpu = counts === null ? '' : ':gpu';
        const variant = (ready: typeof radixHistogram): typeof radixHistogram =>
            counts === null
                ? ready
                : bindPoints(ready, new Map([[radixCountPoint, radixCountGpu]]));
        const countBinding: [WgslResource, BindingSource][] =
            counts === null ? [] : [[setCountResources.counts, counts]];
        const histogram = createComputeKernel(this.ctx.core, {
            discriminator: `${this.disc}:radix_histogram${gpu}`,
            shader: variant(radixHistogram),
            entryPoint: 'radix_histogram_main',
            bindings: new Map<WgslResource, BindingSource>([
                [r.radix, radix],
                [r.keys, inKeys],
                [r.histWrite, hist],
                ...countBinding,
            ]),
        });
        const scatter = createComputeKernel(this.ctx.core, {
            discriminator: `${this.disc}:radix_scatter${valuePair === undefined ? '' : '_kv'}${gpu}`,
            shader: variant(radixScatter),
            entryPoint: valuePair === undefined ? 'radix_scatter_main' : 'radix_scatter_kv_main',
            bindings: new Map<WgslResource, BindingSource>([
                [r.radix, radix],
                [r.keysIn, inKeys],
                [r.keysOut, outKeys],
                [r.histRead, hist],
                ...countBinding,
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

    /** Um número despacha `invocations(count, 256)`; `GpuCount`, o indireto do registro. */
    private run(
        frame: Frame,
        label: string,
        kernel: ComputeKernel,
        offset: number,
        count: number | GpuCount,
        open?: ComputePass,
    ): void {
        const body = (pass: ComputePass): void => {
            pass.bind.setPipeline(kernel.pipeline);
            kernel.bindTo(pass.bind, { draw: [offset] });
            if (typeof count === 'number') pass.dispatch.invocations(count, SCAN_GROUP);
            else pass.dispatch.workgroupsIndirect(count.counts, CountToArgs.dispatchOffset(count));
        };
        if (open !== undefined) body(open);
        else frame.compute(label, body);
    }

    private destroyPrepared(p: PreparedKeys): void {
        for (const k of [p.fromCaller, p.fromTemp]) {
            destroyComputeKernel(this.ctx.core, k.histogram);
            destroyComputeKernel(this.ctx.core, k.scatter);
        }
    }

    private releaseKernels(): void {
        for (const byKeys of this.prepared.values()) {
            for (const p of byKeys.values()) this.destroyPrepared(p);
        }
        this.prepared.clear();
    }
}
