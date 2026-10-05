import type { EngineCore } from '../../core/contracts/index';
import type { FlowRegistry } from '../../scene/flows/FlowRegistry';
import type { ResourceSystem } from '../../scene/systems/ResourceSystem';
import type { World } from '../../scene/world/World';
import type { EventBus } from '../../scene/events/EventBus';
import { ForwardFlow } from './ForwardFlow';
import { ShadowFlow } from './ShadowFlow';
import { PostFlow } from './PostFlow';
import { UIFlow } from './UIFlow';
import { DebugFlow } from './DebugFlow';
import { TransformFlow } from '../../elements/scene/flows/TransformFlow';

/**
 * Dependências necessárias para construir os Flows default. Application
 * passa essas refs do `SceneContext` quando chama `registerPresentationDefaults`.
 */
export interface PresentationDefaultsOptions {
    /** Canvas onde os flows renderizam. */
    readonly canvas: HTMLCanvasElement;
    /** EngineCore (Camada 1) — passado para os flows criarem GPU specs. */
    readonly core: EngineCore;
    /** World (Camada 2) — flows query Resources via World.queryBySchemaName. */
    readonly world: World;
    /** ResourceSystem para acesso aos pools (poolBufferSpec, poolBindGroup). */
    readonly resources: ResourceSystem;
    /** EventBus da cena — o TransformFlow reage a `resourceReady`; o DebugFlow emite profilerStats. */
    readonly events: EventBus;
}

/**
 * Bag dos Flows default registrados pelo Application. Permite o app
 * customizar diretamente (e.g. `defaults.post.addEffect(new Bloom(...))`,
 * `defaults.debug.setEnabled(true)`).
 */
export interface PresentationDefaults {
    /** Estágio de transformação (fase `transform`): intenção dos Transform → matrizes de mundo. */
    readonly transform: TransformFlow;
    /** Forward render pass principal (bind-shadows + per-entity pipelines). */
    readonly forward: ForwardFlow;
    /** Shadow map pass (depth-only, light POV). */
    readonly shadow: ShadowFlow;
    /** Post-processing chain (Bloom/Fxaa/etc. em ping-pong). */
    readonly post: PostFlow;
    /** UI pass (quads + glyphs sobre o canvas). */
    readonly ui: UIFlow;
    /** Debug overlay — emite profilerStats event quando habilitado. */
    readonly debug: DebugFlow;
}

/**
 * Cria e registra os 5 Flows default no FlowRegistry, com bindings adequados
 * (forward bind shadow, post bind forward, debug bind events).
 *
 * Ordem importa: Shadow → Forward → Post → Debug → UI (priority dentro
 * das phases).
 *
 * Chamado uma vez por `Application.create`. Apps que querem pipeline
 * customizado podem ignorar e construir flows manualmente.
 */
export function registerPresentationDefaults(
    flows: FlowRegistry,
    options: PresentationDefaultsOptions,
): PresentationDefaults {
    const transform = new TransformFlow(options.core, options.resources, options.events);
    const shadow = new ShadowFlow(options.core, options.world, options.resources);
    const forward = new ForwardFlow(
        options.core,
        options.world,
        options.resources,
        options.canvas,
    ).bindShadowFlow(shadow);
    const post = new PostFlow({ canvas: options.canvas }, options.core).bindForwardFlow(forward);
    forward.setRenderToOffscreen(true);
    const ui = new UIFlow(options.core, options.canvas);
    const debug = new DebugFlow();
    debug.bindEvents(options.events);
    flows.register(transform);
    flows.register(shadow);
    flows.register(forward);
    flows.register(post);
    flows.register(debug);
    flows.register(ui);
    return { transform, forward, shadow, post, ui, debug };
}
