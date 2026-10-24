import type {
    Binder,
    PipelineSpec,
    BindGroupSpec,
    BindingLayoutEntry,
    ComputePipelineSpec,
    EngineCore,
    LayoutSpec,
    ShaderModuleSpec,
} from '../../core/contracts/index';
import type { ResolvedSource } from '../consumers/ResolvedSource';
import { composeWgsl } from '../shaders/composeWgsl';
import type { WgslModule } from '../shaders/WgslModule';
import { LayoutInferencer } from '../systems/LayoutInferencer';
import { checkLayoutLimits } from '../systems/flowBinding/limits';
import { bindingEntryOf, layoutEntryOf, normalizeSource } from '../systems/flowBinding/sources';
import {
    bindGroupsTo,
    bindingKeyParts,
    type BindingSource,
    type BindingSources,
    type GroupOffsets,
    type PreparedGroup,
} from './FlowBinding';
import type { BindingFrequency, WgslResource } from '../shaders/WgslResource';

/**
 * Kernel de compute criado pela C2: pipeline do módulo de entrada, layouts inferidos do WGSL e bind groups ligados
 * às fontes de cada recurso declarado. Use durante a gravação:
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
    /** Grupos de uma frequência (recursos declarados, spec 031). */
    groupsOf(frequency: BindingFrequency): readonly PreparedGroup[];
    /** Grava todos os grupos, com os offsets da frequência dos grupos dinâmicos (spec 031). */
    bindTo<P extends PipelineSpec>(binder: Binder<P>, offsets?: GroupOffsets): void;
}

/**
 * Opções de `createComputeKernel`: módulo WGSL de entrada (montado por `composeWgsl`), entry point e as fontes de cada
 * recurso declarado **pela identidade** (spec 031) — buffer de qualquer papel (uniform, storage, vértice, índice, indireto),
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
     * Fontes por recurso declarado. Cada recurso usado pela entrada precisa de uma fonte; recurso que a entrada não usa é
     * erro.
     */
    readonly bindings: BindingSources;
    /** Constantes `override` do shader. */
    readonly constants?: Readonly<Record<string, number>>;
    /** Se true, o pipeline compila em segundo plano (`core.createAsync`). */
    readonly preferAsync?: boolean;
}

const inferencer = new LayoutInferencer();

/**
 * Cria um kernel de compute (shader + layouts + pipeline + bind groups) numa chamada idempotente (cache por specHash
 * via `core.create`). O shader vem da montagem do módulo de entrada (`composeWgsl`); o layout é inferido do WGSL
 * montado — só os bindings que a entrada alcança, com visibilidade de compute — e cada binding recebe a fonte do
 * seu recurso declarado (pela identidade, não pelo nome).
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
    const named = new Map<WgslResource, BindingSource>();
    for (const [key, source] of opts.bindings) {
        const { pipeline, resource } = bindingKeyParts(key);
        if (pipeline !== undefined) {
            throw new Error(
                `createComputeKernel("${opts.discriminator}"): fonte de '${resource.name}' por pipeline ('${pipeline}') — o kernel tem um só; use o recurso como chave.`,
            );
        }
        named.set(resource, source);
    }
    const layout = inferencer.infer(composed, [opts.entryPoint]);
    const used = new Set<WgslResource>();
    const groups: {
        entries: BindingLayoutEntry[];
        sources: { binding: number; source: ResolvedSource }[];
    }[] = [];
    for (const g of layout.groups) {
        const entries: BindingLayoutEntry[] = [];
        const sources: { binding: number; source: ResolvedSource }[] = [];
        for (const entry of g.entries) {
            const raw = named.get(entry.declared);
            if (raw === undefined) {
                throw new Error(
                    `createComputeKernel("${opts.discriminator}"): binding '${entry.name}' (@group(${g.group}) @binding(${entry.binding})) sem fonte.`,
                );
            }
            used.add(entry.declared);
            const source = normalizeSource(raw);
            const layoutEntry = layoutEntryOf(
                entry,
                source,
                undefined,
                core.capabilities().features.includes('float32-filterable'),
            );
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
    const unused = [...named.keys()].filter((r) => !used.has(r)).map((r) => r.name);
    if (unused.length > 0) {
        throw new Error(
            `createComputeKernel("${opts.discriminator}"): fonte para '${unused.join("', '")}', que a entrada '${opts.entryPoint}' não usa.`,
        );
    }
    checkLayoutLimits(
        `createComputeKernel("${opts.discriminator}")`,
        groups.map((g) => g.entries),
        core.capabilities().limits,
    );
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
    const dynamic = groups.map((g) =>
        g.sources.some((s) => s.source.kind === 'buffer' && s.source.dynamic !== undefined),
    );
    return {
        pipeline,
        bindGroup: bindGroups[0]!,
        layout: layouts[0]!,
        bindGroups,
        layouts,
        dynamic,
        bindTo: (binder, offsets) => {
            bindGroupsTo(
                binder,
                layout.groups.map((g) => ({
                    index: g.group,
                    spec: bindGroups[g.group]!,
                    dynamic: dynamic[g.group] === true,
                    ...(g.frequency !== undefined ? { frequency: g.frequency } : {}),
                })),
                offsets,
                `createComputeKernel("${opts.discriminator}")`,
            );
        },
        groupsOf: (frequency) =>
            layout.groups
                .filter((g) => g.frequency === frequency)
                .map((g) => ({
                    index: g.group,
                    spec: bindGroups[g.group]!,
                    dynamic: dynamic[g.group] === true,
                })),
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
        ...(opts.constants !== undefined ? { constants: opts.constants } : {}),
    };
    if (opts.preferAsync === true) void core.createAsync<ComputePipelineSpec>(pipeline);
    else core.create<ComputePipelineSpec>(pipeline);
    return pipeline;
}

function layoutDiscriminator(prefix: string, idx: number, single: boolean): string {
    return single ? `${prefix}_layout` : `${prefix}_layout_${idx}`;
}

function bgDiscriminator(prefix: string, idx: number, single: boolean): string {
    return single ? `${prefix}_bg` : `${prefix}_bg_${idx}`;
}
