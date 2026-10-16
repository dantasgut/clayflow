import type {
    Binder,
    PipelineSpec,
    BindGroupSpec,
    ComputePipelineSpec,
    RenderPipelineSpec,
    SamplerSpec,
    TextureViewSpec,
} from '../../core/contracts/index';
import type { BindableBufferSpec, ResolvedSource } from '../consumers/ResolvedSource';
import type { PipelineDescriptor } from '../descriptors/PipelineDescriptor';
import type { BindingFrequency, WgslResource } from '../shaders/WgslResource';
import type { InferredLayout } from '../systems/LayoutInferencer';
import type { BoundSlots, SlotMap } from './slots';

/**
 * Fonte de um binding **privado** do Flow, pelo nome da variável no WGSL: uma fonte completa (`ResolvedSource`, ex.:
 * uniform com offset dinâmico) ou, abreviado, o buffer, a view ou o sampler.
 */
export type BindingSource = ResolvedSource | BindableBufferSpec | TextureViewSpec | SamplerSpec;

/**
 * Bindings privados por nome de variável WGSL. A chave `variável` vale para todos os pipelines do Flow; a chave
 * `pipeline:variável` vale só para o pipeline de id `pipeline` e vence a anterior (ex.: a mesma variável `np_params`
 * com um buffer por variante de narrowphase).
 */
export type BindingSources =
    | Readonly<Record<string, BindingSource>>
    | ReadonlyMap<BindingKey, BindingSource>;

/**
 * Chave de um binding privado declarado (spec 031): o próprio recurso (vale para todos os pipelines do Flow) ou o
 * recurso num pipeline (`{ pipeline, resource }`, vence o anterior).
 */
export type BindingKey =
    | WgslResource
    | {
          /** Id do pipeline. */
          readonly pipeline: string;
          /** O recurso. */
          readonly resource: WgslResource;
      };

/** Chave textual de um binding privado (`variável` ou `pipeline:variável`). */
export function bindingKeyName(key: BindingKey): string {
    return 'pipeline' in key && 'resource' in key && typeof key.pipeline === 'string'
        ? `${key.pipeline}:${key.resource.name}`
        : (key as WgslResource).name;
}

/** As fontes como pares (chave textual, fonte). */
export function bindingEntries(sources: BindingSources): [string, BindingSource][] {
    if (sources instanceof Map) {
        return [...(sources as ReadonlyMap<BindingKey, BindingSource>)].map(([k, v]) => [
            bindingKeyName(k),
            v,
        ]);
    }
    return Object.entries(sources as Readonly<Record<string, BindingSource>>);
}

/** Um grupo do pipeline preparado: índice, bind group atual e se leva offset dinâmico. */
export interface PreparedGroup {
    /** Índice do grupo (para `setBindGroup`). */
    readonly index: number;
    /** Bind group atual. */
    readonly spec: BindGroupSpec;
    /** Leva offsets dinâmicos. */
    readonly dynamic: boolean;
}

interface PreparedBase {
    /** Id do descritor (ou do pipeline preparado em transição). */
    readonly id: string;
    /** Descritor de origem. */
    readonly descriptor: PipelineDescriptor;
    /** Layout inferido do WGSL montado. */
    readonly layout: InferredLayout;
    /**
     * Bind groups atuais, um por `@group` (o índice é o do grupo). A C2 os substitui quando uma fonte é recriada
     * (`bindGroupReplaced`); leia a cada gravação, não guarde.
     */
    readonly groups: readonly BindGroupSpec[];
    /** `dynamic[g]`: o grupo `g` tem bindings com offset dinâmico — o `setBindGroup` leva os offsets. */
    readonly dynamic: readonly boolean[];
    /** Compilado e pronto para gravar. */
    readonly ready: boolean;
    /**
     * Grupos de uma frequência (spec 031): o estágio grava `setBindGroup(g.index, g.spec, …)` para a frequência que
     * mudou, sem índices escritos no código.
     */
    groupsOf(frequency: BindingFrequency): readonly PreparedGroup[];
    /**
     * Grava todos os grupos (spec 031): `setBindGroup(índice, grupo, offsets)` para cada grupo, com os offsets da
     * frequência do grupo quando ele é dinâmico.
     * @throws Error se um grupo dinâmico não tem offsets em `offsets`.
     */
    bindTo<P extends PipelineSpec>(binder: Binder<P>, offsets?: GroupOffsets): void;
}

/** Offsets dinâmicos por frequência (para `bindTo`). */
export type GroupOffsets = Readonly<Partial<Record<BindingFrequency, readonly number[]>>>;

/** Grava os grupos `groups` (índice, bind group, dinâmico) com os offsets da frequência de cada grupo dinâmico. */
export function bindGroupsTo<P extends PipelineSpec>(
    binder: Binder<P>,
    groups: readonly (PreparedGroup & { readonly frequency?: BindingFrequency })[],
    offsets: GroupOffsets | undefined,
    label: string,
): void {
    for (const g of groups) {
        if (!g.dynamic) {
            binder.setBindGroup(g.index, g.spec);
            continue;
        }
        const o = g.frequency === undefined ? undefined : offsets?.[g.frequency];
        if (o === undefined) {
            throw new Error(
                `${label}: grupo ${g.index} (${g.frequency ?? 'sem frequência'}) é dinâmico e não recebeu offsets.`,
            );
        }
        binder.setBindGroup(g.index, g.spec, [...o]);
    }
}

/** Pipeline de compute preparado pela C2. */
export interface PreparedCompute extends PreparedBase {
    /** Papel do pipeline. */
    readonly role: 'compute';
    /** Spec compilado (para `setPipeline`). */
    readonly spec: ComputePipelineSpec;
}

/** Pipeline de render preparado pela C2. */
export interface PreparedRender extends PreparedBase {
    /** Papel do pipeline. */
    readonly role: 'render';
    /** Spec compilado (para `setPipeline`). */
    readonly spec: RenderPipelineSpec;
}

/** Pipeline preparado pela C2: spec compilado, layouts inferidos e bind groups ligados. */
export type PreparedPipeline = PreparedCompute | PreparedRender;

/** O que o `dispatch` recebe: slots resolvidos e pipelines preparados. */
export interface BoundFlow<TSlots extends SlotMap = SlotMap> {
    /** Slots resolvidos, por nome (opcionais ausentes são `undefined`). */
    readonly slots: BoundSlots<TSlots>;
    /** Pipelines preparados por id (declarados e preparados em transições). */
    readonly pipelines: ReadonlyMap<string, PreparedPipeline>;
    /**
     * Pipeline de compute `id`.
     * @throws Error se não existe ou não é de compute.
     */
    compute(id: string): PreparedCompute;
    /**
     * Pipeline de render `id`.
     * @throws Error se não existe ou não é de render.
     */
    render(id: string): PreparedRender;
}

/** Contexto de uma transição (`run`). */
export interface TransitionContext<TSlots extends SlotMap = SlotMap> {
    /** Slots e pipelines atuais. */
    readonly bound: BoundFlow<TSlots>;
    /**
     * Liga (ou troca) bindings privados por nome de variável. A C2 recria os bind groups que os usam antes da próxima
     * gravação; use ao recriar um recurso privado (ex.: contatos após o crescimento do pool de corpos).
     */
    bind(sources: BindingSources): void;
    /**
     * Prepara um pipeline além dos declarados (ex.: o de um material que entrou na cena). Idempotente por `id`. Fica
     * pronto em `pipelinesCompiled { pipeline: id }` quando compilado em segundo plano.
     */
    prepare(descriptor: PipelineDescriptor): PreparedPipeline;
    /** Libera um pipeline preparado em transição (e os seus bind groups). */
    release(id: string): void;
}
