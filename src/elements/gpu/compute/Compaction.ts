import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { WorkContext, WorkPart } from '../../../scene/flows/FlowWork';
import type { Frame, IndirectBufferSpec, StorageBufferSpec } from '../../../scene/contracts/gpu';
import type { BindingKey, BindingSource } from '../../../scene/flows/FlowBinding';
import type { ComputeKernel } from '../../../scene/flows/createComputeKernel';
import {
    createComputeKernel,
    destroyComputeKernel,
} from '../../../scene/flows/createComputeKernel';
import type { WgslModule } from '../../../scene/shaders/WgslModule';
import { bindPoints } from '../../../scene/shaders/bindPoints';
import { CountToArgs, type GpuCount } from './CountToArgs';
import { FrameUniforms } from './FrameUniforms';
import { PrefixSum, SCAN_GROUP } from './PrefixSum';
import { CompactParamsSchema, wordBuffer } from './schemas';
import {
    compactCountGpu,
    compactCountPoint,
    compactionModules,
    compactResources,
    setCountResources,
} from './shaders';

/** Opções de `Compaction`. */
export interface CompactionOptions {
    /** Prefixo único dos recursos da instância. */
    readonly discriminator: string;
    /**
     * Predicado do consumidor: define `fn compact_keep(i: u32) -> bool` e `fn compact_value(i: u32) -> u32` e requer
     * os recursos que lê (spec 031; fontes em `bindings`, pelo objeto do recurso).
     */
    readonly predicate: WgslModule;
    /** Tamanho máximo da saída (elementos u32). */
    readonly capacity: number;
    /** Preserva a ordem da entrada (flags + `PrefixSum` + espalhamento). Padrão `false` (`atomic_alloc`). */
    readonly stable?: boolean;
    /** Maior `count` de entrada — obrigatório com `stable` (dimensiona as flags e a soma de prefixos). */
    readonly inputCapacity?: number;
    /** Fontes dos recursos privados lidos pelo predicado. */
    readonly bindings?: ReadonlyMap<BindingKey, BindingSource>;
}

/** Argumentos de `Compaction.record`. */
export interface CompactionRecordArgs {
    /**
     * Elementos de entrada avaliados pelo predicado (`i ∈ [0, count)`). `0` só zera o contador. Ou a contagem lida na
     * GPU (`GpuCount`, com `out` preparado com o mesmo `counts`).
     */
    readonly count: number | GpuCount;
    /** Saída `u32[capacity]`, preparada antes (`prepare`). */
    readonly out: StorageBufferSpec;
    /** Contador `AtomicAllocCounter`: aceitos (`count`, inclui os recusados) e excedente (`overflow`). */
    readonly counter: StorageBufferSpec;
}

/** Kernels ligados a um par (saída, contador). */
interface BoundKernels {
    readonly counter: StorageBufferSpec;
    readonly atomic?: ComputeKernel;
    readonly flags?: ComputeKernel;
    readonly scatter?: ComputeKernel;
}

/**
 * Compactação de índices ou valores por predicado (research R10 da 005): os elementos `i` com `compact_keep(i)` viram
 * `compact_value(i)` numa lista densa. Modo padrão: um passe com `atomic_alloc` (ordem não garantida). Modo
 * `stable`: flags, soma de prefixos exclusiva e espalhamento — ordem da entrada preservada, resultado determinístico.
 * Nos dois modos o excedente acima de `capacity` é contado (`overflow`) e nada é escrito fora da saída.
 *
 * Contagem da GPU (spec 031, R10): preparada com `counts`, a compactação aceita `count: { counts, index }` — a
 * entrada vem do registro `SetCount` no próprio kernel (ponto `compact_count`), sem leitura de volta; os passes por
 * elemento despacham pelo argumento indireto do registro, que precisa já trazer o despacho para grupos de 256
 * (`CountToArgs` com `workgroupSize: 256` gravado antes no mesmo fluxo), e a soma de prefixos do modo `stable` usa a
 * mesma contagem. O total vai para o contador como no caminho da CPU (quem o consome copia para um `SetCount` na GPU).
 * No modo `stable`, a contagem do registro deve ser ≤ `inputCapacity`.
 *
 * Duas fases (spec 006): `prepare(out, counter, gravaçõesPorQuadro, counts?)` fora da gravação; `record` só grava. As
 * flags do modo `stable` são um descritor do Resource de trabalho (spec 039).
 */
export class Compaction implements WorkPart {
    private readonly disc: string;
    private readonly capacity: number;
    private readonly stable: boolean;
    private readonly inputCapacity: number;
    private readonly bindings: ReadonlyMap<BindingKey, BindingSource>;
    private readonly modules: ReturnType<typeof compactionModules>;
    private readonly params: FrameUniforms;
    /** `destroy()` soltou os descritores (a C2 libera os buffers); o próximo `prepare` os declara de novo. */
    private released = false;
    private readonly scan: PrefixSum | null;
    /** Kernels por origem da contagem (`null` = CPU; um buffer `SetCount` = variante da GPU) e saída. */
    private readonly bound = new Map<
        IndirectBufferSpec | null,
        Map<StorageBufferSpec, BoundKernels>
    >();

    constructor(
        private readonly ctx: WorkContext,
        options: CompactionOptions,
    ) {
        if (!Number.isInteger(options.capacity) || options.capacity < 1) {
            throw new RangeError(
                `Compaction(${options.discriminator}): capacity deve ser inteiro ≥ 1 (recebeu ${options.capacity}).`,
            );
        }
        this.stable = options.stable === true;
        const inputCapacity = options.inputCapacity ?? 0;
        if (this.stable && (!Number.isInteger(inputCapacity) || inputCapacity < 1)) {
            throw new RangeError(
                `Compaction(${options.discriminator}): o modo stable exige inputCapacity inteiro ≥ 1.`,
            );
        }
        this.disc = options.discriminator;
        this.capacity = options.capacity;
        this.inputCapacity = inputCapacity;
        this.bindings = options.bindings ?? new Map();
        this.modules = compactionModules(options.predicate);
        this.params = new FrameUniforms(ctx, {
            id: `${this.disc}:compact`,
            schema: CompactParamsSchema,
        });
        this.scan = this.stable
            ? new PrefixSum(ctx, {
                  discriminator: `${this.disc}:compact_scan`,
                  capacity: inputCapacity,
              })
            : null;
        ctx.work.use(this);
    }

    /** As flags do modo `stable` (u32 por elemento de entrada). */
    descriptors(): readonly GPUDescriptor[] {
        return this.stable && !this.released
            ? [wordBuffer(`${this.disc}:compact_flags`, this.inputCapacity * 4)]
            : [];
    }

    /** Flags do modo `stable` (alocadas pela C2). */
    private get flagsBuffer(): StorageBufferSpec {
        const buffer = this.ctx.resources.bufferOf(this.ctx.work, `${this.disc}:compact_flags`);
        if (buffer === undefined)
            throw new Error(`Compaction(${this.disc}): trabalho fora da cena.`);
        return buffer as StorageBufferSpec;
    }

    /**
     * Prepara a compactação para a saída `out` e o contador `counter`, para até `recordsPerFrame` gravações por
     * quadro. Com `counts`, também os kernels da variante de contagem da GPU ligados a esse buffer de registros
     * `SetCount` (memorizados por buffer). Idempotente; chamado fora da gravação.
     */
    prepare(
        out: StorageBufferSpec,
        counter: StorageBufferSpec,
        recordsPerFrame = 1,
        counts?: IndirectBufferSpec,
    ): void {
        if (this.released) {
            this.released = false;
            this.ctx.work.refresh();
        }
        if (this.params.reserve(recordsPerFrame)) this.releaseKernels();
        if (this.stable) {
            this.scan!.prepare(this.flagsBuffer, recordsPerFrame, counts);
        }
        for (const source of counts === undefined ? [null] : [null, counts]) {
            let byOut = this.bound.get(source);
            if (byOut === undefined) this.bound.set(source, (byOut = new Map()));
            const cached = byOut.get(out);
            if (cached?.counter === counter) continue;
            if (cached !== undefined) this.destroyBound(cached);
            byOut.set(out, this.createKernels(source, out, counter));
        }
    }

    /**
     * Grava a compactação de `[0, count)` em `out`; o contador é zerado no fluxo de comandos antes.
     * @throws Error se (`out`, `counter`) não foi preparado.
     */
    record(frame: Frame, args: CompactionRecordArgs): void {
        const { count, out, counter } = args;
        if (typeof count !== 'number') {
            this.recordGpu(frame, args, count);
            return;
        }
        if (!Number.isInteger(count) || count < 0) {
            throw new RangeError(
                `Compaction(${this.disc}): count deve ser inteiro ≥ 0 (recebeu ${count}).`,
            );
        }
        if (this.stable && count > this.inputCapacity) {
            throw new RangeError(
                `Compaction(${this.disc}): count ${count} acima de inputCapacity ${this.inputCapacity}.`,
            );
        }
        const kernels = this.bound.get(null)?.get(out);
        if (kernels?.counter !== counter) {
            throw new Error(`Compaction(${this.disc}): prepare(out, counter) antes de gravar.`);
        }
        frame.clear(counter);
        if (count === 0) return;
        this.runPasses(frame, kernels, count, 0);
    }

    /** Variante de contagem da GPU: os mesmos passes, despachados pelo indireto do registro `count`. */
    private recordGpu(frame: Frame, args: CompactionRecordArgs, count: GpuCount): void {
        const owner = `Compaction(${this.disc})`;
        CountToArgs.check(owner, count);
        const kernels = this.bound.get(count.counts)?.get(args.out);
        if (kernels?.counter !== args.counter) {
            throw new Error(`${owner}: prepare(out, counter, gravações, counts) antes de gravar.`);
        }
        frame.clear(args.counter);
        this.runPasses(frame, kernels, count, count.index);
    }

    /** Atômico num passe, ou flags + soma de prefixos + espalhamento; `count` também é o despacho. */
    private runPasses(
        frame: Frame,
        kernels: BoundKernels,
        count: number | GpuCount,
        countIndex: number,
    ): void {
        // Na variante da GPU o campo `count` não é lido (o kernel lê o registro `count_index`).
        const offset = this.params.allocate(frame, {
            count: typeof count === 'number' ? count : 0,
            capacity: this.capacity,
            count_index: countIndex,
        });
        if (!this.stable) {
            this.run(frame, 'Compaction.atomic', kernels.atomic!, offset, count);
            return;
        }
        this.run(frame, 'Compaction.flags', kernels.flags!, offset, count);
        this.scan!.record(frame, { src: this.flagsBuffer, dst: this.flagsBuffer, count });
        this.run(frame, 'Compaction.scatter', kernels.scatter!, offset, count);
    }

    /** Libera os kernels e solta as flags e a soma de prefixos (a C2 libera os buffers); `prepare` os declara de novo. */
    destroy(): void {
        this.releaseKernels();
        this.scan?.destroy();
        this.released = true;
        this.params.release();
        this.ctx.work.refresh();
    }

    private createKernels(
        counts: IndirectBufferSpec | null,
        out: StorageBufferSpec,
        counter: StorageBufferSpec,
    ): BoundKernels {
        const compact = this.params.source();
        const r = compactResources;
        const gpu = counts === null ? '' : ':gpu';
        const variant = (ready: WgslModule): WgslModule =>
            counts === null
                ? ready
                : bindPoints(ready, new Map([[compactCountPoint, compactCountGpu]]));
        const countBinding: [BindingKey, BindingSource][] =
            counts === null ? [] : [[setCountResources.counts, counts]];
        if (!this.stable) {
            return {
                counter,
                atomic: createComputeKernel(this.ctx.core, {
                    discriminator: `${this.disc}:compact_atomic${gpu}`,
                    shader: variant(this.modules.atomic),
                    entryPoint: 'compact_atomic_main',
                    bindings: new Map<BindingKey, BindingSource>([
                        ...this.bindings,
                        ...countBinding,
                        [r.compact, compact],
                        [r.out, out],
                        [r.counter, counter],
                    ]),
                }),
            };
        }
        const flags = this.flagsBuffer;
        return {
            counter,
            flags: createComputeKernel(this.ctx.core, {
                discriminator: `${this.disc}:compact_flags${gpu}`,
                shader: variant(this.modules.flags),
                entryPoint: 'compact_flags_main',
                bindings: new Map<BindingKey, BindingSource>([
                    ...this.bindings,
                    ...countBinding,
                    [r.compact, compact],
                    [r.flags, flags],
                ]),
            }),
            scatter: createComputeKernel(this.ctx.core, {
                discriminator: `${this.disc}:compact_scatter${gpu}`,
                shader: variant(this.modules.scatter),
                entryPoint: 'compact_scatter_main',
                bindings: new Map<BindingKey, BindingSource>([
                    ...this.bindings,
                    ...countBinding,
                    [r.compact, compact],
                    [r.out, out],
                    [r.counter, counter],
                    [r.positions, flags],
                ]),
            }),
        };
    }

    /** Um número despacha `invocations(count, 256)`; `GpuCount`, o indireto do registro. */
    private run(
        frame: Frame,
        label: string,
        kernel: ComputeKernel,
        offset: number,
        count: number | GpuCount,
    ): void {
        frame.compute(label, (pass) => {
            pass.bind.setPipeline(kernel.pipeline);
            kernel.bindTo(pass.bind, { draw: [offset] });
            if (typeof count === 'number') pass.dispatch.invocations(count, SCAN_GROUP);
            else pass.dispatch.workgroupsIndirect(count.counts, CountToArgs.dispatchOffset(count));
        });
    }

    private destroyBound(entry: BoundKernels): void {
        for (const k of [entry.atomic, entry.flags, entry.scatter]) {
            if (k !== undefined) destroyComputeKernel(this.ctx.core, k);
        }
    }

    private releaseKernels(): void {
        for (const byOut of this.bound.values()) {
            for (const entry of byOut.values()) this.destroyBound(entry);
        }
        this.bound.clear();
    }
}
