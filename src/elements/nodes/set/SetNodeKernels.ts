import type {
    AnyBufferSpec,
    ComputePass,
    Frame,
    IndirectBufferSpec,
    StorageBufferSpec,
    UniformBufferSpec,
} from '../../../scene/contracts/gpu';
import type { StructSchema } from '../../../scene/descriptors/StructSchema';
import type { BindingSource } from '../../../scene/flows/FlowBinding';
import {
    createComputeKernel,
    destroyComputeKernel,
    type ComputeKernel,
} from '../../../scene/flows/createComputeKernel';
import { setDispatchOffset, SET_GROUP } from '../../../scene/graph/GraphFlow';
import type { SetNodeContext } from '../../../scene/graph/SetNode';
import type { WgslModule } from '../../../scene/shaders/WgslModule';
import type { WgslResource } from '../../../scene/shaders/WgslResource';

/**
 * O que uma instância de nó de conjunto possui na GPU (spec 031, R10): o uniform dos parâmetros (escrito pela CPU em
 * `update`), buffers próprios e os kernels, todos com o prefixo da instância e liberados juntos em `dispose`. Os
 * despachos sobre um conjunto vão pelo argumento indireto do registro `SetCount` dele (da CPU ou derivado na GPU por
 * `CountToArgs`), em grupos de `SET_GROUP`.
 */
export class SetNodeKernels {
    private readonly kernels = new Map<string, ComputeKernel>();
    private readonly buffers: AnyBufferSpec[] = [];
    /** Uniform dos parâmetros da instância. */
    readonly params: UniformBufferSpec;

    constructor(
        private readonly ctx: SetNodeContext,
        private readonly schema: StructSchema,
    ) {
        this.params = this.uniform('params', schema);
    }

    /** Escreve os parâmetros (fora da gravação: `update`). */
    write(data: Record<string, unknown>): void {
        this.writeTo(this.params, this.schema, data);
    }

    /** Buffer de storage próprio de `byteSize` bytes (mínimo 16). */
    storage(name: string, byteSize: number): StorageBufferSpec {
        const b = this.ctx.core.create<StorageBufferSpec>({
            kind: 'buffer',
            subkind: 'storage',
            discriminator: `${this.ctx.id}:${name}`,
            byteSize: Math.max(16, Math.ceil(byteSize / 4) * 4),
        });
        this.buffers.push(b);
        return b;
    }

    /** Uniform próprio adicional com o layout de `schema` (ex.: o da contagem aceita), escrito com `writeTo`. */
    uniform(name: string, schema: StructSchema): UniformBufferSpec {
        const b = this.ctx.core.create<UniformBufferSpec>({
            kind: 'buffer',
            subkind: 'uniform',
            discriminator: `${this.ctx.id}:${name}`,
            byteSize: Math.max(16, Math.ceil(schema.stride / 16) * 16),
        });
        this.buffers.push(b);
        return b;
    }

    /** Escreve `data` com o layout de `schema` num uniform próprio (fora da gravação). */
    writeTo(buffer: UniformBufferSpec, schema: StructSchema, data: Record<string, unknown>): void {
        this.ctx.core.write(buffer, schema.pack(data));
    }

    /** Registros `SetCount` próprios (descritor `indirect`). */
    records(name: string, byteSize: number): IndirectBufferSpec {
        const b = this.ctx.core.create<IndirectBufferSpec>({
            kind: 'buffer',
            subkind: 'indirect',
            discriminator: `${this.ctx.id}:${name}`,
            byteSize,
        });
        this.buffers.push(b);
        return b;
    }

    /** Cria (ou troca) o kernel `name`: a entrada `entry` de `shader` com as fontes pela identidade do recurso. */
    kernel(
        name: string,
        shader: WgslModule,
        entry: string,
        bindings: readonly (readonly [WgslResource, BindingSource])[],
    ): void {
        const old = this.kernels.get(name);
        if (old !== undefined) destroyComputeKernel(this.ctx.core, old);
        this.kernels.set(
            name,
            createComputeKernel(this.ctx.core, {
                discriminator: `${this.ctx.id}:${name}`,
                shader,
                entryPoint: entry,
                bindings: new Map(bindings),
            }),
        );
    }

    /** Despacho pelo argumento indireto do registro `slot` dos contadores do grafo (contagem lida no kernel). */
    indirect(frame: Frame, label: string, name: string, slot: number): void {
        this.run(frame, label, name, (pass) =>
            pass.dispatch.workgroupsIndirect(this.ctx.counts, setDispatchOffset(slot)),
        );
    }

    /** Despacho direto de `invocations` invocações (contagem conhecida na CPU: a capacidade de um alvo, um parâmetro). */
    direct(frame: Frame, label: string, name: string, invocations: number): void {
        this.run(frame, label, name, (pass) => pass.dispatch.invocations(invocations, SET_GROUP));
    }

    /** Um grupo de uma invocação (kernels que derivam contagens). */
    single(frame: Frame, label: string, name: string): void {
        this.run(frame, label, name, (pass) => pass.dispatch.workgroups(1));
    }

    /** Libera kernels, uniform e buffers próprios. */
    dispose(): void {
        for (const k of this.kernels.values()) destroyComputeKernel(this.ctx.core, k);
        this.kernels.clear();
        for (const b of this.buffers) this.ctx.core.destroy(b);
        this.buffers.length = 0;
    }

    private run(
        frame: Frame,
        label: string,
        name: string,
        dispatch: (pass: ComputePass) => void,
    ): void {
        const kernel = this.kernels.get(name);
        if (kernel === undefined) throw new Error(`${this.ctx.id}: kernel '${name}' não criado.`);
        frame.compute(label, (pass) => {
            pass.bind.setPipeline(kernel.pipeline);
            kernel.bindTo(pass.bind);
            dispatch(pass);
        });
    }
}
