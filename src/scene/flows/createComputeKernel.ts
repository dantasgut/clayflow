import type {
    BindGroupSpec,
    BindingLayoutEntry,
    ComputeKernelBindGroup,
    ComputeKernelBinding,
    ComputePipelineSpec,
    EngineCore,
    LayoutSpec,
    ShaderModuleSpec,
} from '../../core/contracts/index';
import type { ResolvedSource } from '../consumers/ConsumerResolver';
import { composeWgsl } from '../shaders/composeWgsl';
import type { WgslModule } from '../shaders/WgslModule';
import { LayoutInferencer } from '../systems/LayoutInferencer';
import { bindingEntryOf, layoutEntryOf, normalizeSource } from '../systems/flowBinding/sources';
import type { BindingSource } from './FlowBinding';

export type {
    ComputeKernelBinding,
    ComputeKernelBindingType,
    ComputeKernelBindGroup,
} from '../../core/contracts/index';

/**
 * Kernel de compute criado pela C2: pipeline do módulo de entrada, layouts inferidos do WGSL e bind groups ligados
 * às fontes por nome de variável. Use durante a gravação:
 * ```ts
 * pass.bind.setPipeline(kernel.pipeline);
 * kernel.bindGroups.forEach((bg, i) => pass.bind.setBindGroup(i, bg, kernel.dynamic[i] ? [offset] : undefined));
 * ```
 */
export interface ComputeKernel {
    /** Pipeline de compute — passe a `pass.bind.setPipeline`. */
    readonly pipeline: ComputePipelineSpec;
    /** Primeiro bindgroup (atalho de `bindGroups[0]`). */
    readonly bindGroup: BindGroupSpec;
    /** Primeiro layout (atalho de `layouts[0]`). */
    readonly layout: LayoutSpec;
    /** Bind groups, um por `@group` (índice = grupo). */
    readonly bindGroups: readonly BindGroupSpec[];
    /** Layouts, um por `@group`. */
    readonly layouts: readonly LayoutSpec[];
    /** `dynamic[g]`: o grupo `g` tem binding com offset dinâmico (o `setBindGroup` leva o offset). */
    readonly dynamic: readonly boolean[];
}

/**
 * Opções de `createComputeKernel`: módulo WGSL de entrada (montado por `composeWgsl`), entry point e as fontes de cada
 * binding **pelo nome da variável no WGSL** — buffer de qualquer papel (uniform, storage, vértice, índice, indireto),
 * view de textura, sampler, ou fonte completa (com `dynamic`, `offset`, `size`). Grupos, índices, tipo e visibilidade
 * vêm do shader (`LayoutInferencer.infer`).
 */
export interface ComputeKernelOptions {
    /**
     * Prefixo único usado para gerar discriminator de cada artifact (`{prefix}_layout`, `{prefix}_pipeline`,
     * `{prefix}_bg`). Mesma string → mesmo specHash → reuso idempotente do GPU object.
     */
    readonly discriminator: string;
    /** Módulo de entrada; dependências e structs entram pela montagem (`composeWgsl`). */
    readonly shader: WgslModule;
    /** Nome da função `@compute @workgroup_size(...)`, definida no módulo de entrada. */
    readonly entryPoint: string;
    /**
     * Fontes por nome de variável WGSL. Cada binding usado pela entrada precisa de uma fonte; nome que não é binding
     * usado pela entrada é erro.
     *
     * Forma por índice (`ComputeKernelBinding[]`): **base de migração da spec 006**, aceita só enquanto os estágios
     * migram; sai com o último.
     */
    readonly bindings?: Readonly<Record<string, BindingSource>> | readonly ComputeKernelBinding[];
    /**
     * Forma por índice com vários grupos — **base de migração da spec 006**, sai com o último estágio migrado.
     * @deprecated Use `bindings` por nome.
     */
    readonly bindGroups?: readonly ComputeKernelBindGroup[];
    /** Se true, o pipeline compila em segundo plano (`core.createAsync`). */
    readonly preferAsync?: boolean;
}

const inferencer = new LayoutInferencer();

/**
 * Cria um kernel de compute (shader + layouts + pipeline + bind groups) numa chamada idempotente (cache por specHash
 * via `core.create`). O shader vem da montagem do módulo de entrada (`composeWgsl`); o layout é inferido do WGSL
 * montado — só os bindings que a entrada alcança, com visibilidade de compute — e cada binding recebe a fonte do
 * mesmo nome.
 *
 * @throws Error se a entrada não é função do módulo, se falta fonte para um binding usado, se uma fonte nomeia uma
 *   variável que a entrada não usa, ou se a fonte é incompatível com o binding (uniform × storage).
 */
export function createComputeKernel(core: EngineCore, opts: ComputeKernelOptions): ComputeKernel {
    const composed = composeWgsl(opts.shader);
    if (!opts.shader.symbols.some((s) => s.kind === 'fn' && s.name === opts.entryPoint)) {
        throw new Error(
            `createComputeKernel("${opts.discriminator}"): entry point '${opts.entryPoint}' não é função do módulo '${opts.shader.name}'.`,
        );
    }
    if (opts.bindGroups !== undefined || Array.isArray(opts.bindings))
        return createByIndex(core, opts, composed.spec);
    const named = (opts.bindings ?? {}) as Readonly<Record<string, BindingSource>>;
    const layout = inferencer.infer(composed, [opts.entryPoint]);
    const used = new Set<string>();
    const groups: {
        entries: BindingLayoutEntry[];
        sources: { binding: number; source: ResolvedSource }[];
    }[] = [];
    for (const g of layout.groups) {
        const entries: BindingLayoutEntry[] = [];
        const sources: { binding: number; source: ResolvedSource }[] = [];
        for (const entry of g.entries) {
            const raw = named[entry.name];
            if (raw === undefined) {
                throw new Error(
                    `createComputeKernel("${opts.discriminator}"): binding '${entry.name}' (@group(${g.group}) @binding(${entry.binding})) sem fonte.`,
                );
            }
            used.add(entry.name);
            const source = normalizeSource(raw);
            const layoutEntry = layoutEntryOf(entry, source, undefined);
            if (typeof layoutEntry === 'string') {
                throw new Error(
                    `createComputeKernel("${opts.discriminator}"): binding '${entry.name}' incompatível — ${layoutEntry}.`,
                );
            }
            entries.push(layoutEntry);
            sources.push({ binding: entry.binding, source });
        }
        groups.push({ entries, sources });
    }
    const unused = Object.keys(named).filter((n) => !used.has(n));
    if (unused.length > 0) {
        throw new Error(
            `createComputeKernel("${opts.discriminator}"): fonte para '${unused.join("', '")}', que a entrada '${opts.entryPoint}' não usa.`,
        );
    }
    const single = groups.length === 1;
    const layouts = groups.map((g, i) =>
        core.create<LayoutSpec>({
            kind: 'layout',
            discriminator: layoutDiscriminator(opts.discriminator, i, single),
            entries: g.entries,
        }),
    );
    const pipeline = createPipeline(core, opts, composed.spec, layouts);
    const bindGroups = groups.map((g, i) =>
        core.create<BindGroupSpec>({
            kind: 'bindgroup',
            discriminator: bgDiscriminator(opts.discriminator, i, single),
            layout: layouts[i]!,
            bindings: g.sources.map((s) => bindingEntryOf(s.binding, s.source)),
        }),
    );
    return {
        pipeline,
        bindGroup: bindGroups[0]!,
        layout: layouts[0]!,
        bindGroups,
        layouts,
        dynamic: groups.map((g) =>
            g.sources.some((s) => s.source.kind === 'buffer' && s.source.dynamic !== undefined),
        ),
    };
}

/**
 * Libera a posse das specs criadas por `createComputeKernel` para `kernel`: bind groups, pipeline, shader e layouts.
 * Objetos de GPU compartilhados por conteúdo com outros kernels vivos continuam existindo (posse por spec,
 * `EngineCore.destroy`). Use ao substituir um kernel (fonte recriada) e no descarte do dono.
 */
export function destroyComputeKernel(core: EngineCore, kernel: ComputeKernel): void {
    for (const bindGroup of kernel.bindGroups) core.destroy(bindGroup);
    core.destroy(kernel.pipeline);
    core.destroy(kernel.pipeline.shader);
    for (const layout of kernel.layouts) core.destroy(layout);
}

function createPipeline(
    core: EngineCore,
    opts: ComputeKernelOptions,
    shaderSpec: ShaderModuleSpec,
    layouts: readonly LayoutSpec[],
): ComputePipelineSpec {
    // Cada kernel recebe a sua cópia da spec montada: mesmo conteúdo, mesmo objeto de GPU, posse independente.
    const shader = core.create<ShaderModuleSpec>({ ...shaderSpec });
    const pipeline: ComputePipelineSpec = {
        kind: 'pipeline',
        subkind: 'compute',
        discriminator: `${opts.discriminator}_pipeline`,
        layouts,
        shader,
        entryPoint: opts.entryPoint,
    };
    if (opts.preferAsync === true) void core.createAsync<ComputePipelineSpec>(pipeline);
    else core.create<ComputePipelineSpec>(pipeline);
    return pipeline;
}

/** Forma por índice (base de migração da spec 006). */
function createByIndex(
    core: EngineCore,
    opts: ComputeKernelOptions,
    shaderSpec: ShaderModuleSpec,
): ComputeKernel {
    const groups: readonly ComputeKernelBindGroup[] = opts.bindGroups ?? [
        { bindings: opts.bindings as readonly ComputeKernelBinding[] },
    ];
    const single = groups.length === 1;
    const layouts: LayoutSpec[] = groups.map((g, i) =>
        core.create<LayoutSpec>({
            kind: 'layout',
            discriminator: layoutDiscriminator(opts.discriminator, i, single),
            entries: g.bindings.map((b) => ({
                binding: b.binding,
                visibility: GPUShaderStage.COMPUTE,
                kind: 'buffer' as const,
                type: b.type,
                ...(b.hasDynamicOffset === true ? { hasDynamicOffset: true } : {}),
            })),
        }),
    );
    const pipeline = createPipeline(core, opts, shaderSpec, layouts);
    const bindGroups: BindGroupSpec[] = groups.map((g, i) =>
        core.create<BindGroupSpec>({
            kind: 'bindgroup',
            discriminator: bgDiscriminator(opts.discriminator, i, single),
            layout: layouts[i]!,
            bindings: g.bindings.map((b) => ({
                binding: b.binding,
                kind: 'buffer' as const,
                buffer: b.buffer,
                ...(b.size !== undefined ? { size: b.size } : {}),
            })),
        }),
    );
    return {
        pipeline,
        bindGroup: bindGroups[0]!,
        layout: layouts[0]!,
        bindGroups,
        layouts,
        dynamic: groups.map((g) => g.bindings.some((b) => b.hasDynamicOffset === true)),
    };
}

function layoutDiscriminator(prefix: string, idx: number, single: boolean): string {
    return single ? `${prefix}_layout` : `${prefix}_layout_${idx}`;
}

function bgDiscriminator(prefix: string, idx: number, single: boolean): string {
    return single ? `${prefix}_bg` : `${prefix}_bg_${idx}`;
}
