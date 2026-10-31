import type {
    AnyBufferSpec,
    ComputePass,
    Frame,
    IndirectBufferSpec,
    StorageBufferSpec,
    UniformBufferSpec,
} from '../../../scene/contracts/gpu';
import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { StructSchema } from '../../../scene/descriptors/StructSchema';
import type { WorkPart } from '../../../scene/flows/FlowWork';
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
import { GpuWordSchema, wordBuffer } from '../../gpu/compute/schemas';

/**
 * O que uma instância de nó de conjunto possui na GPU (spec 031, R10): o uniform dos parâmetros (escrito pela CPU em
 * `update`), buffers próprios e os kernels, todos com o prefixo da instância e liberados juntos em `dispose`. Os
 * despachos sobre um conjunto vão pelo argumento indireto do registro `SetCount` dele (da CPU ou derivado na GPU por
 * `CountToArgs`), em grupos de `SET_GROUP`.
 *
 * Uniforms e buffers são descritores do Resource de trabalho do grafo (spec 039, `ctx.work`): cada pedido redescreve o
 * trabalho e a C2 aloca na hora; os uniforms são de uma região, escritos na hora pela C2 (`writeRegions`); `dispose`
 * solta os descritores e a C2 libera os buffers.
 */
export class SetNodeKernels implements WorkPart {
    private readonly kernels = new Map<string, ComputeKernel>();
    /** Descritores próprios, na ordem dos pedidos. */
    private readonly declared: GPUDescriptor[] = [];
    /** Id e schema de cada uniform próprio, pelo buffer alocado. */
    private readonly uniforms = new Map<
        UniformBufferSpec,
        { readonly id: string; readonly schema: StructSchema }
    >();
    /** Uniform dos parâmetros da instância. */
    readonly params: UniformBufferSpec;

    constructor(
        private readonly ctx: SetNodeContext,
        private readonly schema: StructSchema,
    ) {
        ctx.work.work.use(this);
        this.params = this.uniform('params', schema);
    }

    descriptors(): readonly GPUDescriptor[] {
        return this.declared;
    }

    /** Escreve os parâmetros (fora da gravação: `update`). */
    write(data: Record<string, unknown>): void {
        this.writeTo(this.params, this.schema, data);
    }

    /** Buffer de storage próprio de `byteSize` bytes (mínimo 16). */
    storage(name: string, byteSize: number): StorageBufferSpec {
        return this.declare(wordBuffer(`${this.ctx.id}:${name}`, byteSize)) as StorageBufferSpec;
    }

    /**
     * Buffer de storage próprio só de leitura com o conteúdo `data` (palavras de 32 bits), enviado pela C2 na alocação
     * (ex.: uma tabela de senos e cossenos fixa na criação do nó).
     */
    constant(name: string, data: Float32Array | Uint32Array): StorageBufferSpec {
        const id = `${this.ctx.id}:${name}`;
        this.ctx.work.work.data[id] = data;
        return this.declare({
            id,
            role: 'storage-ro',
            schema: GpuWordSchema,
            count: data.length,
        }) as StorageBufferSpec;
    }

    /** Uniform próprio adicional com o layout de `schema` (ex.: o da contagem aceita), escrito com `writeTo`. */
    uniform(name: string, schema: StructSchema): UniformBufferSpec {
        const id = `${this.ctx.id}:${name}`;
        const buffer = this.declare({
            id,
            role: 'uniform',
            schema,
            regions: { count: 1 },
        }) as UniformBufferSpec;
        this.uniforms.set(buffer, { id, schema });
        return buffer;
    }

    /** Escreve `data` com o layout de `schema` num uniform próprio (fora da gravação). */
    writeTo(buffer: UniformBufferSpec, schema: StructSchema, data: Record<string, unknown>): void {
        const own = this.uniforms.get(buffer);
        if (own?.schema !== schema)
            throw new Error(
                `${this.ctx.id}: writeTo num uniform que não é desta instância (ou com outro schema).`,
            );
        this.ctx.work.resources.writeRegions(this.ctx.work.work, own.id, [data]);
    }

    /** Registros `SetCount` próprios (descritor `indirect`). */
    records(name: string, byteSize: number): IndirectBufferSpec {
        return this.declare(
            wordBuffer(`${this.ctx.id}:${name}`, byteSize, 'indirect'),
        ) as IndirectBufferSpec;
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

    /** Libera os kernels e solta uniforms e buffers próprios (a C2 os libera com a redescrição do trabalho). */
    dispose(): void {
        for (const k of this.kernels.values()) destroyComputeKernel(this.ctx.core, k);
        this.kernels.clear();
        for (const desc of this.declared) this.ctx.work.work.data[desc.id] = undefined;
        this.declared.length = 0;
        this.uniforms.clear();
        this.ctx.work.work.refresh();
    }

    /** Declara um descritor no trabalho (a C2 aloca na hora) e devolve o buffer. */
    private declare(desc: GPUDescriptor): Exclude<AnyBufferSpec, { subkind: 'staging' }> {
        this.declared.push(desc);
        this.ctx.work.work.refresh();
        const buffer = this.ctx.work.resources.bufferOf(this.ctx.work.work, desc.id);
        if (buffer === undefined || buffer.subkind === 'staging')
            throw new Error(`${this.ctx.id}: o trabalho do grafo não está na cena.`);
        return buffer;
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
