import type { BindingSource } from '../../../scene/flows/FlowBinding';
import type { WgslResource } from '../../../scene/shaders/WgslResource';
import type {
    EngineCore,
    Frame,
    IndirectBufferSpec,
    StorageBufferSpec,
} from '../../../scene/contracts/gpu';
import type { ComputeKernel } from '../../../scene/flows/createComputeKernel';
import {
    createComputeKernel,
    destroyComputeKernel,
} from '../../../scene/flows/createComputeKernel';
import { bindPoints } from '../../../scene/shaders/bindPoints';
import { CountToArgs, type GpuCount } from './CountToArgs';
import { FrameUniforms } from './FrameUniforms';
import { SCAN_GROUP } from './PrefixSum';
import { ReduceLevelSchema } from './schemas';
import {
    reduceCountGpu,
    reduceCountPoint,
    reduceKernel,
    type ReduceOpName,
    type ReduceType,
    reduceResources,
    setCountResources,
} from './shaders';

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
    /** Entrada `T[count]`, preparada antes (`prepare`). */
    readonly src: StorageBufferSpec;
    /**
     * Elementos (≤ `capacity`). `0` não grava nada (a saída fica como está). Ou a contagem lida na GPU (`GpuCount`,
     * com `src` preparado com o mesmo `counts`): todos os passes da capacidade são gravados, a contagem real limitando
     * cada um no kernel.
     */
    readonly count: number | GpuCount;
    /** Buffer de saída, preparado com `src`. */
    readonly out: StorageBufferSpec;
    /** Índice (em elementos) do resultado em `out`. Padrão 0. */
    readonly outOffset?: number;
}

/** Kernels de uma entrada: por passe `k`, o que escreve no parcial seguinte e o que escreve na saída (último passe). */
interface PreparedPair {
    readonly out: StorageBufferSpec;
    readonly toPartial: (ComputeKernel | undefined)[];
    readonly toOut: ComputeKernel[];
}

/**
 * Redução de `T[count]` a um valor (research R11 da 005): árvore por grupo de 256 em memória de workgroup, níveis até
 * restar um valor. Soma, mínimo ou máximo de u32, i32 ou f32 (módulo de operação `reduceOp`, memorizado). Soma de f32
 * tem ordem de soma diferente da sequencial: tolerância relativa `1e-5 × log2(count)` (contrato).
 *
 * Contagem da GPU (spec 031, R10): preparada com `counts`, a redução aceita `count: { counts, index }` — a contagem
 * vem do registro `SetCount` no próprio kernel (ponto `reduce_count`, nível pela profundidade), sem leitura de volta. O
 * primeiro passe despacha pelo argumento indireto do registro, que precisa já trazer o despacho para grupos de 256
 * (`CountToArgs` com `workgroupSize: 256` gravado antes no mesmo fluxo); os seguintes despacham pela capacidade do
 * nível. Os passes além do último real reduzem um valor só (`reduce_op(v, identidade) = v`); contagem 0 não escreve
 * nada. A contagem do registro deve ser ≤ `capacity`.
 *
 * Duas fases (spec 006): `prepare(src, out, gravaçõesPorQuadro, counts?)` cria parciais, kernels de todos os passes
 * possíveis e regiões de uniform, fora da gravação; `record` só grava.
 */
export class Reduce {
    private readonly disc: string;
    private readonly capacity: number;
    private readonly levelCapacity: readonly number[];
    private readonly params: FrameUniforms;
    private readonly shader: ReturnType<typeof reduceKernel>;
    /** Resultados parciais dos níveis intermediários (`partials[k - 1]` = nível k). */
    private partials: StorageBufferSpec[] | null = null;
    /** Kernels por origem da contagem (`null` = CPU; um buffer `SetCount` = variante da GPU) e buffer de entrada. */
    private readonly prepared = new Map<
        IndirectBufferSpec | null,
        Map<StorageBufferSpec, PreparedPair>
    >();

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

    /**
     * Prepara a redução de `src` em `out` para até `recordsPerFrame` gravações por quadro. Com `counts`, também os
     * kernels da variante de contagem da GPU ligados a esse buffer de registros `SetCount` (memorizados por buffer).
     * Idempotente; fora da gravação.
     */
    prepare(
        src: StorageBufferSpec,
        out: StorageBufferSpec,
        recordsPerFrame = 1,
        counts?: IndirectBufferSpec,
    ): void {
        const maxPasses = this.levelCapacity.length - 1;
        if (this.params.reserve(maxPasses * recordsPerFrame)) this.releaseKernels();
        const partials = (this.partials ??= this.allocate());
        for (const source of counts === undefined ? [null] : [null, counts]) {
            let bySrc = this.prepared.get(source);
            if (bySrc === undefined) this.prepared.set(source, (bySrc = new Map()));
            const cached = bySrc.get(src);
            if (cached?.out === out) continue;
            if (cached !== undefined) this.destroyPair(cached);
            const pair: PreparedPair = { out, toPartial: [], toOut: [] };
            for (let k = 0; k < maxPasses; k++) {
                const input = k === 0 ? src : partials[k - 1]!;
                pair.toOut.push(this.kernel(source, input, out));
                pair.toPartial.push(
                    k < maxPasses - 1 ? this.kernel(source, input, partials[k]!) : undefined,
                );
            }
            bySrc.set(src, pair);
        }
    }

    /**
     * Grava a redução de `src[0, count)` em `out[outOffset]`.
     * @throws Error se (`src`, `out`) não foi preparado.
     */
    record(frame: Frame, args: ReduceRecordArgs): void {
        const { src, count, out } = args;
        const outOffset = args.outOffset ?? 0;
        if (typeof count !== 'number') {
            this.recordGpu(frame, args, count);
            return;
        }
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
        this.checkOutOffset(outOffset);
        if (count === 0) return;
        const pair = this.prepared.get(null)?.get(src);
        if (pair?.out !== out)
            throw new Error(`Reduce(${this.disc}): prepare(src, out) antes de gravar.`);
        const counts = reduceLevelCounts(count);
        this.runPasses(frame, pair, counts.slice(0, -1), count, outOffset, 0);
    }

    /**
     * Variante de contagem da GPU: todos os passes da capacidade, contagens do registro `count` no kernel, o primeiro
     * pelo despacho indireto do registro e os seguintes pela capacidade do nível.
     */
    private recordGpu(frame: Frame, args: ReduceRecordArgs, count: GpuCount): void {
        const owner = `Reduce(${this.disc})`;
        CountToArgs.check(owner, count);
        const outOffset = args.outOffset ?? 0;
        this.checkOutOffset(outOffset);
        const pair = this.prepared.get(count.counts)?.get(args.src);
        if (pair?.out !== args.out)
            throw new Error(`${owner}: prepare(src, out, gravações, counts) antes de gravar.`);
        this.runPasses(frame, pair, this.levelCapacity.slice(0, -1), count, outOffset, count.index);
    }

    /**
     * Grava um passe por nível de `counts` (a contagem da CPU, ou a capacidade na variante da GPU): os níveis k ≥ 1
     * despacham `counts[k]` invocações; o nível 0, `first` — a contagem da CPU ou o despacho indireto do registro.
     */
    private runPasses(
        frame: Frame,
        pair: PreparedPair,
        counts: readonly number[],
        first: number | GpuCount,
        outOffset: number,
        countIndex: number,
    ): void {
        const passes = counts.length;
        const offsets = counts.map((n, k) =>
            this.params.allocate(frame, {
                count: n,
                out_index: k === passes - 1 ? outOffset : 0,
                depth: k,
                count_index: countIndex,
            }),
        );
        for (let k = 0; k < passes; k++) {
            const kernel = k === passes - 1 ? pair.toOut[k]! : pair.toPartial[k]!;
            const dispatch = k === 0 ? first : counts[k]!;
            frame.compute('Reduce', (pass) => {
                pass.bind.setPipeline(kernel.pipeline);
                kernel.bindTo(pass.bind, { draw: [offsets[k]!] });
                if (typeof dispatch === 'number') pass.dispatch.invocations(dispatch, SCAN_GROUP);
                else
                    pass.dispatch.workgroupsIndirect(
                        dispatch.counts,
                        CountToArgs.dispatchOffset(dispatch),
                    );
            });
        }
    }

    private checkOutOffset(outOffset: number): void {
        if (!Number.isInteger(outOffset) || outOffset < 0) {
            throw new RangeError(
                `Reduce(${this.disc}): outOffset deve ser inteiro ≥ 0 (recebeu ${outOffset}).`,
            );
        }
    }

    /** Libera kernels, parciais e uniforms. */
    destroy(): void {
        this.releaseKernels();
        for (const b of this.partials ?? []) this.core.destroy(b);
        this.partials = null;
        this.params.destroy();
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

    private kernel(
        counts: IndirectBufferSpec | null,
        input: StorageBufferSpec,
        output: StorageBufferSpec,
    ): ComputeKernel {
        const bindings = new Map<WgslResource, BindingSource>([
            [reduceResources.level, this.params.source()],
            [reduceResources.input, input],
            [reduceResources.output, output],
        ]);
        if (counts !== null) bindings.set(setCountResources.counts, counts);
        return createComputeKernel(this.core, {
            discriminator: `${this.disc}:reduce${counts === null ? '' : ':gpu'}`,
            shader:
                counts === null
                    ? this.shader
                    : bindPoints(this.shader, new Map([[reduceCountPoint, reduceCountGpu]])),
            entryPoint: 'reduce_main',
            bindings,
        });
    }

    private destroyPair(pair: PreparedPair): void {
        for (const k of [...pair.toOut, ...pair.toPartial]) {
            if (k !== undefined) destroyComputeKernel(this.core, k);
        }
    }

    private releaseKernels(): void {
        for (const bySrc of this.prepared.values()) {
            for (const pair of bySrc.values()) this.destroyPair(pair);
        }
        this.prepared.clear();
    }
}
