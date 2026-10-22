import type {
    Binder,
    PipelineSpec,
    BindGroupSpec,
    BindingLayoutEntry,
    ComputePipelineSpec,
    EngineCore,
    LayoutSpec,
    RenderPipelineSpec,
    ShaderMessage,
    ShaderModuleSpec,
} from '../../../core/contracts/index';
import type { ResolvedSource } from '../../consumers/ResolvedSource';
import type { PipelineDescriptor } from '../../descriptors/PipelineDescriptor';
import { FlowBindingError } from '../../flows/FlowBindingError';
import {
    bindGroupsTo,
    type GroupOffsets,
    type PreparedCompute,
    type PreparedGroup,
    type PreparedRender,
} from '../../flows/FlowBinding';
import type { BindingFrequency } from '../../shaders/WgslResource';
import { composeWgsl, type ComposedShader } from '../../shaders/composeWgsl';
import type { InferredEntry, InferredLayout, LayoutInferencer } from '../LayoutInferencer';
import { checkLayoutLimits } from './limits';
import { WgslCompositionError } from '../../shaders/WgslCompositionError';
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

/** Shaders montados já conferidos pelo compilador (`verify`): conferidos uma vez, qualquer que seja o pipeline. */
const verifying = new WeakMap<ShaderModuleSpec, Promise<readonly ShaderMessage[]>>();
/** Resultado já conhecido da conferência (refazer o pipeline com as mesmas fontes não espera de novo). */
const verified = new WeakMap<ShaderModuleSpec, readonly ShaderMessage[]>();

/** Notificação de shader rejeitado pelo compilador (`descriptor.verify`). */
export type RejectedListener = (state: PipelineState, errors: readonly ShaderMessage[]) => void;

/** Notificação de compilação ou conferência que falhou no device (ex.: device perdido durante a compilação). */
export type FailedListener = (state: PipelineState, message: string) => void;

/** O que falta para o pipeline ficar pronto (prontidão do motor, spec 034). */
export type PipelinePending = 'waiting' | 'verifying' | 'compiling';

/**
 * Um pipeline de Flow preparado pela C2: shader montado, layout inferido, fontes resolvidas, layouts, pipeline e bind
 * groups criados. `refresh()` reavalia as fontes: fonte recriada → bind group recriado (o antigo é liberado);
 * entrada de layout diferente (ex.: formato de textura não filtrável) → pipeline recriado.
 */
export class PipelineState {
    readonly role: 'compute' | 'render';
    readonly layout: InferredLayout;
    private readonly composedShader: ShaderModuleSpec;
    /** O shader montado (módulos e as suas linhas, para traduzir mensagens do compilador). */
    readonly composed: ComposedShader;
    /**
     * Erros do compilador quando o shader foi rejeitado (`descriptor.verify`) — ou o limite do device excedido pelas
     * ligações do código de fora (`descriptor.extensions`: um pool por forma de função, spec 031 R8); `null` sem
     * rejeição.
     */
    rejected: readonly ShaderMessage[] | null = null;
    private shader: ShaderModuleSpec | null = null;
    private layoutSpecs: LayoutSpec[] = [];
    private layoutEntries: BindingLayoutEntry[][] = [];
    private sources: ResolvedSource[][] = [];
    private pipelineSpec: ComputePipelineSpec | RenderPipelineSpec | null = null;
    private bindGroups: BindGroupSpec[] = [];
    private dynamicGroups: boolean[] = [];
    private compiled = false;
    /** Layouts e bind groups criados (o pipeline pode ainda estar sendo conferido ou compilado, ou ter sido rejeitado). */
    private built = false;
    private token = 0;
    /** Fontes ausentes na última tentativa (o pipeline espera). */
    waiting = true;
    /** Nome do binding sem fonte na última tentativa (`undefined` com todas as fontes). */
    missing: string | undefined;
    /** Mensagem da compilação ou conferência que falhou no device; `null` sem falha. */
    failed: string | null = null;

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
        /** Chamado quando o compilador rejeita o shader (`descriptor.verify`). */
        private readonly onRejected: RejectedListener = () => undefined,
        /** Chamado quando a compilação ou a conferência falha no device. */
        private readonly onFailed: FailedListener = () => undefined,
    ) {
        this.role = descriptor.role;
        if (this.role === 'compute' && descriptor.entryPoints.length !== 1) {
            throw new FlowBindingError(
                `Flow '${flowType}': pipeline de compute '${id}' deve ter uma entrada (tem ${descriptor.entryPoints.length}).`,
                { flow: flowType, pipeline: id },
            );
        }
        const composed = composeWgsl(descriptor.shader);
        this.composed = composed;
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

    /** Grupos da frequência (spec 031). */
    groupsOf(frequency: BindingFrequency): readonly PreparedGroup[] {
        const out: PreparedGroup[] = [];
        for (const g of this.layout.groups) {
            if (g.frequency !== frequency) continue;
            const spec = this.bindGroups[g.group];
            if (spec === undefined) continue;
            out.push({ index: g.group, spec, dynamic: this.dynamicGroups[g.group] === true });
        }
        return out;
    }

    /** Grava todos os grupos (spec 031). */
    bindTo<P extends PipelineSpec>(binder: Binder<P>, offsets?: GroupOffsets): void {
        bindGroupsTo(
            binder,
            this.layout.groups.flatMap((g) => {
                const spec = this.bindGroups[g.group];
                return spec === undefined
                    ? []
                    : [
                          {
                              index: g.group,
                              spec,
                              dynamic: this.dynamicGroups[g.group] === true,
                              ...(g.frequency !== undefined ? { frequency: g.frequency } : {}),
                          },
                      ];
            }),
            offsets,
            `Flow '${this.flowType}', pipeline '${this.id}'`,
        );
    }

    get ready(): boolean {
        return this.pipelineSpec !== null && this.compiled && !this.waiting && this.failed === null;
    }

    /**
     * O que falta para ficar pronto: fonte ausente (`waiting`), conferência do compilador em voo (`verifying`) ou
     * compilação em voo (`compiling`); `undefined` quando pronto ou em estado final (rejeitado ou falho).
     */
    get pending(): PipelinePending | undefined {
        if (this.rejected !== null || this.failed !== null) return undefined;
        if (this.waiting) return 'waiting';
        if (this.built && !this.compiled) return this.shader === null ? 'verifying' : 'compiling';
        return undefined;
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
        // Rejeitado pelo limite (sem objetos de GPU): fica assim até o Flow trocar o shader.
        if (this.rejected !== null && !this.built) return false;
        const next: ResolvedSource[][] = [];
        for (const g of this.layout.groups) {
            const list: ResolvedSource[] = [];
            for (const entry of g.entries) {
                const source = lookup(entry, g.group, this);
                if (source === undefined) {
                    const changed = !this.waiting;
                    this.missing = entry.name;
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
        this.missing = undefined;
        if (!this.built || !this.sameLayout(entries)) {
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
        this.built = false;
        this.rejected = null;
        this.failed = null;
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
        try {
            checkLayoutLimits(
                `Flow '${this.flowType}', pipeline '${this.id}'`,
                entries,
                this.core.capabilities().limits,
            );
        } catch (error) {
            // Código de fora (funções de ponto: cada forma traz o seu pool, spec 031 R8) que excede um limite do
            // device: rejeitado como um erro de compilação — a função não vale aqui e o atual (ou o pronto) continua.
            if (
                !(error instanceof WgslCompositionError)
                || (this.descriptor.extensions?.length ?? 0) === 0
            )
                throw error;
            this.release();
            this.waiting = false;
            this.rejected = [{ type: 'error', message: error.message, line: 0, column: 0 }];
            this.onRejected(this, this.rejected);
            return;
        }
        this.release();
        this.waiting = false;
        this.built = true;
        const token = this.token;
        this.layoutEntries = entries;
        this.sources = sources;
        this.layoutSpecs = entries.map((list) =>
            this.core.create<LayoutSpec>({
                kind: 'layout',
                entries: list,
            }),
        );
        this.dynamicGroups = entries.map((list) =>
            list.some((e) => e.kind === 'buffer' && e.hasDynamicOffset === true),
        );
        if (this.descriptor.verify === true) {
            // Código de fora (funções de ponto de extensão): o compilador confere antes de criar o módulo — um erro não
            // chega ao device, e o pipeline fica rejeitado até o Flow trocar o shader.
            const done = (messages: readonly ShaderMessage[], async: boolean): void => {
                const errors = messages.filter((m) => m.type === 'error');
                if (errors.length > 0) {
                    this.rejected = errors;
                    this.onRejected(this, errors);
                    return;
                }
                this.createPipeline(token, async);
            };
            this.compiled = false;
            const known = verified.get(this.composedShader);
            if (known !== undefined) done(known, false);
            else {
                let check = verifying.get(this.composedShader);
                if (check === undefined) {
                    const spec = this.composedShader;
                    check = this.core.shaderMessages(spec).then(
                        (messages) => {
                            verified.set(spec, messages);
                            return messages;
                        },
                        (error: unknown) => {
                            // Falha do device, não do código: a próxima tentativa confere de novo.
                            verifying.delete(spec);
                            throw error;
                        },
                    );
                    verifying.set(spec, check);
                }
                void check.then(
                    (messages) => {
                        if (token === this.token) done(messages, true);
                    },
                    (error: unknown) => {
                        // Depois do descarte (token trocado) a falha não importa a ninguém.
                        if (token === this.token) this.fail(error);
                    },
                );
            }
        } else this.createPipeline(token, this.descriptor.preferAsync === true);
        this.bindGroups = sources.map((list, g) => this.createBindGroup(g, list));
    }

    /**
     * Cria o módulo e o pipeline (síncrono, ou em segundo plano com `onCompiled` ao concluir). O erro de validação da
     * criação (o WGSL que não compila, o descritor inválido) chega depois, pelo escopo de erro do device: sem ele, só
     * apareceria na gravação do quadro, como pipeline inválido sem nome.
     */
    private createPipeline(token: number, async: boolean): void {
        let spec: ComputePipelineSpec | RenderPipelineSpec | undefined;
        void this.core
            .withErrorScope('validation', () => {
                this.shader = this.core.create<ShaderModuleSpec>({ ...this.composedShader });
                spec =
                    this.role === 'compute'
                        ? this.computeSpec(this.shader)
                        : this.renderSpec(this.shader);
                this.pipelineSpec = spec;
                if (!async) this.core.create(spec);
            })
            .catch((error: unknown) => {
                if (token === this.token) this.fail(error);
            });
        if (!async) {
            this.compiled = true;
            return;
        }
        this.compiled = false;
        void this.core.createAsync(spec!).then(
            () => {
                if (token !== this.token) return;
                this.compiled = true;
                this.onCompiled(this);
            },
            (error: unknown) => {
                if (token === this.token) this.fail(error);
            },
        );
    }

    /**
     * Compilação ou conferência falhou no device: estado final até o Flow trocar o shader (ou a cena se refazer). Um
     * aviso por construção (o módulo e o pipeline assíncrono podem falhar os dois).
     */
    private fail(error: unknown): void {
        if (this.failed !== null) return;
        this.failed = error instanceof Error ? error.message : String(error);
        this.onFailed(this, this.failed);
    }

    private createBindGroup(group: number, sources: readonly ResolvedSource[]): BindGroupSpec {
        const entries = this.layout.groups[group]!.entries;
        // Sem label nem discriminator: layouts e bind groups de mesmo conteúdo são o mesmo objeto de GPU (hash da 004).
        return this.core.create<BindGroupSpec>({
            kind: 'bindgroup',
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
            ...(this.descriptor.constants !== undefined
                ? { constants: this.descriptor.constants }
                : {}),
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
                ...(d.constants !== undefined ? { constants: d.constants } : {}),
            },
            ...(fragmentEntry !== undefined
                ? {
                      fragment: {
                          shader,
                          entryPoint: fragmentEntry,
                          targets: d.colorTargets ?? [{ format: this.canvasFormat() }],
                          ...(d.constants !== undefined ? { constants: d.constants } : {}),
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
