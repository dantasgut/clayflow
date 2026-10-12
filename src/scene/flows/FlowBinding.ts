import type {
    BindGroupSpec,
    ComputePipelineSpec,
    RenderPipelineSpec,
    SamplerSpec,
    TextureViewSpec,
} from '../../core/contracts/index';
import type { BindableBufferSpec, ResolvedSource } from '../consumers/ConsumerResolver';
import type { PipelineDescriptor } from '../descriptors/PipelineDescriptor';
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
export type BindingSources = Readonly<Record<string, BindingSource>>;

interface PreparedBase {
    /** Id do descritor (ou do pipeline preparado em transição). */
    readonly id: string;
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
}

/** Pipeline de compute preparado pela C2. */
export interface PreparedCompute extends PreparedBase {
    readonly role: 'compute';
    readonly spec: ComputePipelineSpec;
}

/** Pipeline de render preparado pela C2. */
export interface PreparedRender extends PreparedBase {
    readonly role: 'render';
    readonly spec: RenderPipelineSpec;
}

/** Pipeline preparado pela C2: spec compilado, layouts inferidos e bind groups ligados. */
export type PreparedPipeline = PreparedCompute | PreparedRender;

/** O que o `dispatch` recebe: slots resolvidos e pipelines preparados. */
export interface BoundFlow<TSlots extends SlotMap = SlotMap> {
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
