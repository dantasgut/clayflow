import type {
    BindGroupSpec,
    BindingLayoutEntry,
    ComputePipelineSpec,
    EngineCore,
    LayoutSpec,
    RenderPipelineSpec,
    ShaderModuleSpec,
} from '../../../core/contracts/index';
import type { ResolvedSource } from '../../consumers/ConsumerResolver';
import type { PipelineDescriptor } from '../../descriptors/PipelineDescriptor';
import { FlowBindingError } from '../../flows/FlowBindingError';
import type { PreparedCompute, PreparedRender } from '../../flows/FlowBinding';
import { composeWgsl } from '../../shaders/composeWgsl';
import type { InferredEntry, InferredLayout, LayoutInferencer } from '../LayoutInferencer';
import { bindingEntryOf, layoutEntryOf, sameLayoutEntry, sameSource } from './sources';

/** Resolução da fonte de um binding: a fonte, `undefined` (ainda ausente na cena) ou erro estrutural (lança). */
export type SourceLookup = (
    entry: InferredEntry,
    group: number,
    state: PipelineState,
) => ResolvedSource | undefined;

/** Notificação de bind group substituído. */
export type ReplacedListener = (
    state: PipelineState,
    group: number,
    oldSpec: BindGroupSpec,
    newSpec: BindGroupSpec,
) => void;

/**
 * Um pipeline de Flow preparado pela C2: shader montado, layout inferido, fontes resolvidas, layouts, pipeline e bind
 * groups criados. `refresh()` reavalia as fontes: fonte recriada → bind group recriado (o antigo é liberado);
 * entrada de layout diferente (ex.: formato de textura não filtrável) → pipeline recriado.
 */
export class PipelineState {
    readonly role: 'compute' | 'render';
    readonly layout: InferredLayout;
    private readonly composedShader: ShaderModuleSpec;
    private shader: ShaderModuleSpec | null = null;
    private layoutSpecs: LayoutSpec[] = [];
    private layoutEntries: BindingLayoutEntry[][] = [];
    private sources: ResolvedSource[][] = [];
    private pipelineSpec: ComputePipelineSpec | RenderPipelineSpec | null = null;
    private bindGroups: BindGroupSpec[] = [];
    private dynamicGroups: boolean[] = [];
    private compiled = false;
    private token = 0;
    /** Fontes ausentes na última tentativa (o pipeline espera). */
    waiting = true;

    constructor(
        readonly id: string,
        readonly descriptor: PipelineDescriptor,
        /** Declarado pelo Flow (`pipelines`), ou preparado numa transição. */
        readonly declared: boolean,
        private readonly flowType: string,
        private readonly core: EngineCore,
        inferencer: LayoutInferencer,
        private readonly canvasFormat: () => GPUTextureFormat,
        /** Chamado quando uma compilação assíncrona conclui. */
        private readonly onCompiled: (state: PipelineState) => void,
    ) {
        this.role = descriptor.role;
        if (this.role === 'compute' && descriptor.entryPoints.length !== 1) {
            throw new FlowBindingError(
                `Flow '${flowType}': pipeline de compute '${id}' deve ter uma entrada (tem ${descriptor.entryPoints.length}).`,
                { flow: flowType, pipeline: id },
            );
        }
        const composed = composeWgsl(descriptor.shader);
        this.composedShader = composed.spec;
        this.layout = inferencer.infer(composed, descriptor.entryPoints);
    }

    get spec(): ComputePipelineSpec | RenderPipelineSpec {
        if (this.pipelineSpec === null) {
            throw new Error(
                `Flow '${this.flowType}': pipeline '${this.id}' ainda sem fontes (não preparado).`,
            );
        }
        return this.pipelineSpec;
    }

    get groups(): readonly BindGroupSpec[] {
        return this.bindGroups;
    }

    get dynamic(): readonly boolean[] {
        return this.dynamicGroups;
    }

    get ready(): boolean {
        return this.pipelineSpec !== null && this.compiled && !this.waiting;
    }

    /** Visão do pipeline preparado para o Flow. */
    asPrepared(): PreparedCompute | PreparedRender {
        return this as unknown as PreparedCompute | PreparedRender;
    }

    /**
     * Resolve as fontes e cria (ou atualiza) layouts, pipeline e bind groups. Sem alguma fonte, o pipeline fica
     * esperando (`waiting`), sem bind groups. Devolve `true` se algo mudou.
     * @throws FlowBindingError em erro estrutural (binding sem fonte possível, incompatibilidade).
     */
    refresh(lookup: SourceLookup, onReplaced: ReplacedListener): boolean {
        const next: ResolvedSource[][] = [];
        for (const g of this.layout.groups) {
            const list: ResolvedSource[] = [];
            for (const entry of g.entries) {
                const source = lookup(entry, g.group, this);
                if (source === undefined) {
                    const changed = !this.waiting;
                    this.suspend();
                    return changed;
                }
                list.push(source);
            }
            next.push(list);
        }
        const entries = this.layout.groups.map((g, gi) =>
            g.entries.map((entry, ei) => this.layoutEntry(entry, g.group, next[gi]![ei]!)),
        );
        const wasWaiting = this.waiting;
        this.waiting = false;
        if (this.pipelineSpec === null || !this.sameLayout(entries)) {
            this.build(entries, next);
            return true;
        }
        let changed = wasWaiting;
        for (let g = 0; g < next.length; g++) {
            const same =
                this.bindGroups[g] !== undefined
                && next[g]!.length === this.sources[g]!.length
                && next[g]!.every((s, i) => sameSource(s, this.sources[g]![i]!));
            if (same) continue;
            const old = this.bindGroups[g];
            const fresh = this.createBindGroup(g, next[g]!);
            this.bindGroups[g] = fresh;
            this.sources[g] = next[g]!;
            changed = true;
            if (old !== undefined) {
                this.core.destroy(old);
                onReplaced(this, g, old, fresh);
            }
        }
        return changed;
    }

    /** Libera tudo o que a C2 criou para o pipeline. */
    release(): void {
        this.token++;
        this.destroyBindGroups();
        if (this.pipelineSpec !== null) this.core.destroy(this.pipelineSpec);
        if (this.shader !== null) this.core.destroy(this.shader);
        for (const l of this.layoutSpecs) this.core.destroy(l);
        this.pipelineSpec = null;
        this.shader = null;
        this.layoutSpecs = [];
        this.layoutEntries = [];
        this.sources = [];
        this.compiled = false;
        this.waiting = true;
    }

    private suspend(): void {
        this.waiting = true;
        this.destroyBindGroups();
        this.sources = [];
    }

    private destroyBindGroups(): void {
        for (const bg of this.bindGroups) this.core.destroy(bg);
        this.bindGroups = [];
    }

    private layoutEntry(
        entry: InferredEntry,
        group: number,
        source: ResolvedSource,
    ): BindingLayoutEntry {
        const explicit = this.descriptor.bindings?.[entry.name]?.visibility;
        const result = layoutEntryOf(entry, source, explicit);
        if (typeof result === 'string') {
            throw new FlowBindingError(
                `Flow '${this.flowType}', pipeline '${this.id}': binding '${entry.name}' (@group(${group}) @binding(${entry.binding})) incompatível — ${result}.`,
                {
                    flow: this.flowType,
                    pipeline: this.id,
                    group,
                    binding: entry.binding,
                    variable: entry.name,
                },
            );
        }
        return result;
    }

    private sameLayout(entries: BindingLayoutEntry[][]): boolean {
        return (
            entries.length === this.layoutEntries.length
            && entries.every(
                (g, gi) =>
                    g.length === this.layoutEntries[gi]!.length
                    && g.every((e, ei) => sameLayoutEntry(e, this.layoutEntries[gi]![ei]!)),
            )
        );
    }

    private build(entries: BindingLayoutEntry[][], sources: ResolvedSource[][]): void {
        this.release();
        this.waiting = false;
        const token = this.token;
        this.layoutEntries = entries;
        this.sources = sources;
        this.layoutSpecs = entries.map((list, g) =>
            this.core.create<LayoutSpec>({
                kind: 'layout',
                label: `${this.flowType}:${this.id}:g${g}`,
                entries: list,
            }),
        );
        this.dynamicGroups = entries.map((list) =>
            list.some((e) => e.kind === 'buffer' && e.hasDynamicOffset === true),
        );
        this.shader = this.core.create<ShaderModuleSpec>({ ...this.composedShader });
        const spec =
            this.role === 'compute' ? this.computeSpec(this.shader) : this.renderSpec(this.shader);
        this.pipelineSpec = spec;
        if (this.descriptor.preferAsync === true) {
            this.compiled = false;
            void this.core.createAsync(spec).then(() => {
                if (token !== this.token) return;
                this.compiled = true;
                this.onCompiled(this);
            });
        } else {
            this.core.create(spec);
            this.compiled = true;
        }
        this.bindGroups = sources.map((list, g) => this.createBindGroup(g, list));
    }

    private createBindGroup(group: number, sources: readonly ResolvedSource[]): BindGroupSpec {
        const entries = this.layout.groups[group]!.entries;
        return this.core.create<BindGroupSpec>({
            kind: 'bindgroup',
            label: `${this.flowType}:${this.id}:g${group}`,
            layout: this.layoutSpecs[group]!,
            bindings: sources.map((s, i) => bindingEntryOf(entries[i]!.binding, s)),
        });
    }

    private computeSpec(shader: ShaderModuleSpec): ComputePipelineSpec {
        return {
            kind: 'pipeline',
            subkind: 'compute',
            discriminator: `${this.flowType}:${this.id}`,
            layouts: this.layoutSpecs,
            shader,
            entryPoint: this.descriptor.entryPoints[0]!,
        };
    }

    private renderSpec(shader: ShaderModuleSpec): RenderPipelineSpec {
        const d = this.descriptor;
        const vertexEntry = d.entryPoints.find((e) => this.layout.stages.get(e) === 'vertex');
        const fragmentEntry = d.entryPoints.find((e) => this.layout.stages.get(e) === 'fragment');
        if (vertexEntry === undefined) {
            throw new FlowBindingError(
                `Flow '${this.flowType}': pipeline de render '${this.id}' sem entrada @vertex em [${d.entryPoints.join(', ')}].`,
                { flow: this.flowType, pipeline: this.id },
            );
        }
        return {
            kind: 'pipeline',
            subkind: 'render',
            discriminator: `${this.flowType}:${this.id}`,
            layouts: this.layoutSpecs,
            vertex: {
                shader,
                entryPoint: vertexEntry,
                ...(d.vertexBuffers !== undefined ? { buffers: d.vertexBuffers } : {}),
            },
            ...(fragmentEntry !== undefined
                ? {
                      fragment: {
                          shader,
                          entryPoint: fragmentEntry,
                          targets: d.colorTargets ?? [{ format: this.canvasFormat() }],
                      },
                  }
                : {}),
            primitive: {
                topology: d.topology ?? 'triangle-list',
                cullMode: d.cullMode ?? 'none',
                frontFace: d.frontFace ?? 'ccw',
            },
            ...(d.depth !== undefined ? { depthStencil: d.depth } : {}),
            ...(d.multisample !== undefined ? { multisample: d.multisample } : {}),
        };
    }
}
