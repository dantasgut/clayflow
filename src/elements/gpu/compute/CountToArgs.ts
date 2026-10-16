import type { BindingSource } from '../../../scene/flows/FlowBinding';
import type { WgslResource } from '../../../scene/shaders/WgslResource';
import type { EngineCore, Frame, IndirectBufferSpec } from '../../../scene/contracts/gpu';
import type { ComputeKernel } from '../../../scene/flows/createComputeKernel';
import {
    createComputeKernel,
    destroyComputeKernel,
} from '../../../scene/flows/createComputeKernel';
import { SET_COUNT_DISPATCH_OFFSET, SetCountSchema } from '../../../scene/graph/SetCountSchema';
import { FrameUniforms } from './FrameUniforms';
import { CountToArgsParamsSchema } from './schemas';
import { countToArgs, countToArgsResources } from './shaders';

/**
 * Contagem lida na GPU (spec 031): o registro `SetCount` de índice `index` em `counts`, com o despacho para grupos de
 * 256 já derivado no mesmo fluxo (`CountToArgs` com `workgroupSize: 256` gravado antes). Aceito no lugar de um número
 * pelo `record` de `PrefixSum`, `RadixSort`, `Compaction` e `Reduce` preparados com `counts`.
 */
export interface GpuCount {
    /** Registros `SetCount` (descritor `indirect`). */
    readonly counts: IndirectBufferSpec;
    /** Índice do registro. */
    readonly index: number;
}

/** Opções de `CountToArgs`. */
export interface CountToArgsOptions {
    /** Prefixo único dos recursos da instância. */
    readonly discriminator: string;
}

/** Argumentos de `CountToArgs.record`. */
export interface CountToArgsRecordArgs {
    /** Registros `SetCount` (descritor `indirect`), preparados antes (`prepare`). */
    readonly counts: IndirectBufferSpec;
    /** Índice do registro. */
    readonly index: number;
    /** Invocações por grupo do despacho derivado. */
    readonly workgroupSize: number;
    /** Índices (ou vértices) por elemento no desenho; instanciado, índices por instância. Padrão 0 (sem desenho). */
    readonly perElement?: number;
    /** Instanciado: `count` instâncias de `perElement` índices. Padrão: uma instância de `count · perElement`. */
    readonly instanced?: boolean;
}

/**
 * Contagem → argumentos indiretos (spec 031, R10): um kernel de uma invocação lê a contagem de um registro `SetCount`,
 * escrita na GPU por um nó, e escreve no mesmo registro o despacho linear (`workgroupsIndirect` no byte 4, dividido em
 * x/y como `Dispatcher.invocations`) e o desenho (byte 16). A contagem nunca volta à CPU.
 *
 * Duas fases (spec 006): `prepare(counts, gravaçõesPorQuadro)` cria o kernel e as regiões de uniform, fora da
 * gravação; `record` só grava.
 */
export class CountToArgs {
    private readonly disc: string;
    private readonly params: FrameUniforms;
    private readonly kernels = new Map<IndirectBufferSpec, ComputeKernel>();

    /**
     * Confere uma contagem da GPU recebida por `owner`: índice inteiro ≥ 0 com o registro inteiro dentro de `counts`.
     * @throws RangeError caso contrário.
     */
    static check(owner: string, count: GpuCount): void {
        if (!Number.isInteger(count.index) || count.index < 0) {
            throw new RangeError(
                `${owner}: índice do registro SetCount deve ser inteiro ≥ 0 (recebeu ${count.index}).`,
            );
        }
        const end = (count.index + 1) * SetCountSchema.stride;
        if (end > count.counts.byteSize) {
            throw new RangeError(
                `${owner}: registro SetCount ${count.index} (até o byte ${end}) fora do buffer de ${count.counts.byteSize} B.`,
            );
        }
    }

    /** Byte, em `count.counts`, dos argumentos de despacho do registro (para `workgroupsIndirect`). */
    static dispatchOffset(count: GpuCount): number {
        return count.index * SetCountSchema.stride + SET_COUNT_DISPATCH_OFFSET;
    }

    constructor(
        private readonly core: EngineCore,
        options: CountToArgsOptions,
    ) {
        this.disc = options.discriminator;
        this.params = new FrameUniforms(core, {
            discriminator: `${this.disc}:count_to_args`,
            schema: CountToArgsParamsSchema,
        });
    }

    /** Prepara a conversão sobre `counts` para até `recordsPerFrame` gravações por quadro. Idempotente. */
    prepare(counts: IndirectBufferSpec, recordsPerFrame = 1): void {
        if (this.params.reserve(recordsPerFrame)) this.releaseKernels();
        if (this.kernels.has(counts)) return;
        const r = countToArgsResources;
        this.kernels.set(
            counts,
            createComputeKernel(this.core, {
                discriminator: `${this.disc}:count_to_args:${this.kernels.size}`,
                shader: countToArgs,
                entryPoint: 'count_to_args_main',
                bindings: new Map<WgslResource, BindingSource>([
                    [r.params, this.params.source()],
                    [r.counts, counts],
                ]),
            }),
        );
    }

    /**
     * Grava a conversão do registro `index`.
     * @throws Error se `counts` não foi preparado; RangeError para argumentos inválidos.
     */
    record(frame: Frame, args: CountToArgsRecordArgs): void {
        const kernel = this.kernels.get(args.counts);
        if (kernel === undefined)
            throw new Error(`CountToArgs(${this.disc}): prepare(counts) antes de gravar.`);
        const perElement = args.perElement ?? 0;
        for (const [name, v, min] of [
            ['index', args.index, 0],
            ['workgroupSize', args.workgroupSize, 1],
            ['perElement', perElement, 0],
        ] as const) {
            if (!Number.isInteger(v) || v < min)
                throw new RangeError(
                    `CountToArgs(${this.disc}): ${name} deve ser inteiro ≥ ${min} (recebeu ${v}).`,
                );
        }
        CountToArgs.check(`CountToArgs(${this.disc})`, args);
        const offset = this.params.allocate(frame, {
            index: args.index,
            group_size: args.workgroupSize,
            per_element: perElement,
            instances: 1,
            instanced: args.instanced === true ? 1 : 0,
            max_x: this.core.capabilities().limits.maxComputeWorkgroupsPerDimension ?? 65_535,
        });
        frame.compute('CountToArgs', (pass) => {
            pass.bind.setPipeline(kernel.pipeline);
            kernel.bindTo(pass.bind, { draw: [offset] });
            pass.dispatch.workgroups(1);
        });
    }

    /** Libera kernels e uniforms. */
    destroy(): void {
        this.releaseKernels();
        this.params.destroy();
    }

    private releaseKernels(): void {
        for (const k of this.kernels.values()) destroyComputeKernel(this.core, k);
        this.kernels.clear();
    }
}
