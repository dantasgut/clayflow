import type { EngineCore, Frame, StorageBufferSpec } from '../../../scene/contracts/gpu';
import type { BindingSource } from '../../../scene/flows/FlowBinding';
import type { ComputeKernel } from '../../../scene/flows/createComputeKernel';
import {
    createComputeKernel,
    destroyComputeKernel,
} from '../../../scene/flows/createComputeKernel';
import type { WgslModule } from '../../../scene/shaders/WgslModule';
import { FrameUniforms } from './FrameUniforms';
import { PrefixSum, SCAN_GROUP } from './PrefixSum';
import { CompactParamsSchema } from './schemas';
import { compactionModules } from './shaders';

/** Opções de `Compaction`. */
export interface CompactionOptions {
    /** Prefixo único dos recursos da instância. */
    readonly discriminator: string;
    /**
     * Predicado do consumidor: define `fn compact_keep(i: u32) -> bool` e `fn compact_value(i: u32) -> u32`, e
     * declara no `@group(1)` os buffers que lê (fontes em `bindings`, pelo nome da variável).
     */
    readonly predicate: WgslModule;
    /** Tamanho máximo da saída (elementos u32). */
    readonly capacity: number;
    /** Preserva a ordem da entrada (flags + `PrefixSum` + espalhamento). Padrão `false` (`atomic_alloc`). */
    readonly stable?: boolean;
    /** Maior `count` de entrada — obrigatório com `stable` (dimensiona as flags e a soma de prefixos). */
    readonly inputCapacity?: number;
    /** Fontes dos buffers lidos pelo predicado, pelo nome da variável WGSL. */
    readonly bindings?: Readonly<Record<string, BindingSource>>;
}

/** Argumentos de `Compaction.record`. */
export interface CompactionRecordArgs {
    /** Elementos de entrada avaliados pelo predicado (`i ∈ [0, count)`). `0` só zera o contador. */
    readonly count: number;
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
 * Duas fases (spec 006): `prepare(out, counter, gravaçõesPorQuadro)` fora da gravação; `record` só grava.
 */
export class Compaction {
    private readonly disc: string;
    private readonly capacity: number;
    private readonly stable: boolean;
    private readonly inputCapacity: number;
    private readonly bindings: Readonly<Record<string, BindingSource>>;
    private readonly modules: ReturnType<typeof compactionModules>;
    private readonly params: FrameUniforms;
    private readonly scan: PrefixSum | null;
    private flagsBuffer: StorageBufferSpec | null = null;
    private readonly bound = new Map<StorageBufferSpec, BoundKernels>();

    constructor(
        private readonly core: EngineCore,
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
        this.bindings = options.bindings ?? {};
        this.modules = compactionModules(options.predicate);
        this.params = new FrameUniforms(core, {
            discriminator: `${this.disc}:compact`,
            schema: CompactParamsSchema,
        });
        this.scan = this.stable
            ? new PrefixSum(core, {
                  discriminator: `${this.disc}:compact_scan`,
                  capacity: inputCapacity,
              })
            : null;
    }

    /**
     * Prepara a compactação para a saída `out` e o contador `counter`, para até `recordsPerFrame` gravações por
     * quadro. Idempotente; chamado fora da gravação.
     */
    prepare(out: StorageBufferSpec, counter: StorageBufferSpec, recordsPerFrame = 1): void {
        if (this.params.reserve(recordsPerFrame)) this.releaseKernels();
        if (this.stable) {
            this.flagsBuffer ??= this.core.create<StorageBufferSpec>({
                kind: 'buffer',
                subkind: 'storage',
                discriminator: `${this.disc}:compact_flags`,
                byteSize: Math.max(16, this.inputCapacity * 4),
            });
            this.scan!.prepare(this.flagsBuffer, recordsPerFrame);
        }
        const cached = this.bound.get(out);
        if (cached?.counter === counter) return;
        if (cached !== undefined) this.destroyBound(cached);
        this.bound.set(out, this.createKernels(out, counter));
    }

    /**
     * Grava a compactação de `[0, count)` em `out`; o contador é zerado no fluxo de comandos antes.
     * @throws Error se (`out`, `counter`) não foi preparado.
     */
    record(frame: Frame, args: CompactionRecordArgs): void {
        const { count, out, counter } = args;
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
        const kernels = this.bound.get(out);
        if (kernels?.counter !== counter) {
            throw new Error(`Compaction(${this.disc}): prepare(out, counter) antes de gravar.`);
        }
        frame.clear(counter);
        if (count === 0) return;
        const offset = this.params.allocate(frame, { count, capacity: this.capacity });
        if (!this.stable) {
            this.run(frame, 'Compaction.atomic', kernels.atomic!, offset, count);
            return;
        }
        this.run(frame, 'Compaction.flags', kernels.flags!, offset, count);
        this.scan!.record(frame, { src: this.flagsBuffer!, dst: this.flagsBuffer!, count });
        this.run(frame, 'Compaction.scatter', kernels.scatter!, offset, count);
    }

    /** Libera kernels, flags, soma de prefixos e uniforms. */
    destroy(): void {
        this.releaseKernels();
        if (this.flagsBuffer !== null) this.core.destroy(this.flagsBuffer);
        this.flagsBuffer = null;
        this.scan?.destroy();
        this.params.destroy();
    }

    private createKernels(out: StorageBufferSpec, counter: StorageBufferSpec): BoundKernels {
        const compact = this.params.source();
        if (!this.stable) {
            return {
                counter,
                atomic: createComputeKernel(this.core, {
                    discriminator: `${this.disc}:compact_atomic`,
                    shader: this.modules.atomic,
                    entryPoint: 'compact_atomic_main',
                    bindings: {
                        ...this.bindings,
                        compact,
                        compact_out: out,
                        compact_counter: counter,
                    },
                }),
            };
        }
        const flags = this.flagsBuffer!;
        return {
            counter,
            flags: createComputeKernel(this.core, {
                discriminator: `${this.disc}:compact_flags`,
                shader: this.modules.flags,
                entryPoint: 'compact_flags_main',
                bindings: { ...this.bindings, compact, compact_flags: flags },
            }),
            scatter: createComputeKernel(this.core, {
                discriminator: `${this.disc}:compact_scatter`,
                shader: this.modules.scatter,
                entryPoint: 'compact_scatter_main',
                bindings: {
                    ...this.bindings,
                    compact,
                    compact_out: out,
                    compact_counter: counter,
                    compact_positions: flags,
                },
            }),
        };
    }

    private run(
        frame: Frame,
        label: string,
        kernel: ComputeKernel,
        offset: number,
        count: number,
    ): void {
        frame.compute(label, (pass) => {
            pass.bind.setPipeline(kernel.pipeline).setBindGroup(0, kernel.bindGroups[0]!, [offset]);
            if (kernel.bindGroups[1] !== undefined) pass.bind.setBindGroup(1, kernel.bindGroups[1]);
            pass.dispatch.invocations(count, SCAN_GROUP);
        });
    }

    private destroyBound(entry: BoundKernels): void {
        for (const k of [entry.atomic, entry.flags, entry.scatter]) {
            if (k !== undefined) destroyComputeKernel(this.core, k);
        }
    }

    private releaseKernels(): void {
        for (const entry of this.bound.values()) this.destroyBound(entry);
        this.bound.clear();
    }
}
