import type { EngineCore } from '../../core/contracts/index';
import type { FlowRegistry, FlowRegistration } from '../../scene/flows/FlowRegistry';
import type { ResourceSystem } from '../../scene/systems/ResourceSystem';
import type { World } from '../../scene/world/World';
import type { EventBus } from '../../scene/events/EventBus';
import { ForwardFlow } from './ForwardFlow';
import { ShadowFlow } from './ShadowFlow';
import { PostFlow } from './PostFlow';
import { UIFlow } from './UIFlow';
import { DebugFlow } from './DebugFlow';
import { TransformFlow } from '../../elements/scene/flows/TransformFlow';
import { DEFAULT_SOLVER_REGISTRATIONS } from '../../elements/physics/flows/defaultFlows';
import { FrameTargets } from '../app/FrameTargets';

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

/** Estágios padrão de uma cena, os registros por factory, os alvos do quadro e quantas aplicações os usam. */
interface RegisteredDefaults {
    readonly defaults: PresentationDefaults;
    readonly registrations: readonly FlowRegistration[];
    readonly frameTargets: FrameTargets;
    readonly world: World;
    users: number;
}

/** Estágios padrão por cena (`FlowRegistry`): registrados uma vez, desregistrados com o último usuário. */
const DEFAULTS_BY_SCENE = new WeakMap<FlowRegistry, RegisteredDefaults>();

/**
 * Registra os Flows default da cena — Transform, Shadow, Forward, Post, Debug e UI — e insere os alvos do quadro
 * (`FrameTargets`: o render principal desenha neles, o pós-processamento os lê pelo slot). **Uma vez por cena**: chamadas seguintes com o
 * mesmo `FlowRegistry` devolvem os mesmos estágios e contam mais um usuário (várias aplicações na mesma cena não
 * duplicam estágios). Cada chamada deve ser pareada com `releasePresentationDefaults`.
 *
 * Ordem importa: Shadow → Forward → Post → Debug → UI (priority dentro
 * das phases).
 *
 * Chamado por `Application.create`. Apps que querem pipeline customizado podem ignorar e construir flows
 * manualmente.
 */
export function registerPresentationDefaults(
    flows: FlowRegistry,
    options: PresentationDefaultsOptions,
): PresentationDefaults {
    const existing = DEFAULTS_BY_SCENE.get(flows);
    if (existing !== undefined) {
        existing.users++;
        return existing.defaults;
    }
    const frameTargets = new FrameTargets();
    options.world.insert(frameTargets);
    const { defaults, registrations } = createPresentationDefaults(flows, options);
    DEFAULTS_BY_SCENE.set(flows, {
        defaults,
        registrations,
        frameTargets,
        world: options.world,
        users: 1,
    });
    return defaults;
}

/**
 * Libera um uso dos estágios padrão da cena. O último usuário os desregistra (e descarta: GPU e inscrições).
 * Devolve `true` quando foi o último usuário (nenhuma aplicação usa mais a cena).
 */
export function releasePresentationDefaults(flows: FlowRegistry): boolean {
    const entry = DEFAULTS_BY_SCENE.get(flows);
    if (entry === undefined) return true;
    entry.users--;
    if (entry.users > 0) return false;
    DEFAULTS_BY_SCENE.delete(flows);
    const d = entry.defaults;
    for (const flow of [d.ui, d.debug]) flows.unregister(flow);
    for (const registration of [...entry.registrations].reverse()) flows.unregister(registration);
    entry.world.remove(entry.frameTargets);
    return true;
}

function createPresentationDefaults(
    flows: FlowRegistry,
    options: PresentationDefaultsOptions,
): { defaults: PresentationDefaults; registrations: readonly FlowRegistration[] } {
    const transformRegistration = flows.register((ctx) => new TransformFlow(ctx), {
        type: 'transform',
        phase: 'transform',
    });
    const transform = transformRegistration.flow!;
    const shadowRegistration = flows.register((ctx) => new ShadowFlow(ctx), {
        type: 'shadow',
        phase: 'shadow',
    });
    const forwardRegistration = flows.register((ctx) => new ForwardFlow(ctx, { output: 'scene' }), {
        type: 'forward',
        phase: 'forward',
    });
    const postRegistration = flows.register((ctx) => new PostFlow(ctx), {
        type: 'post',
        phase: 'post',
    });
    const ui = new UIFlow(options.core, options.canvas);
    const debug = new DebugFlow();
    debug.bindEvents(options.events);
    flows.register(debug);
    flows.register(ui);
    // Solvers padrão por factory: a C2 instancia cada um no primeiro corpo do seu tipo.
    const solvers = DEFAULT_SOLVER_REGISTRATIONS.map((r) => flows.register(r.factory, r.options));
    return {
        defaults: {
            transform,
            shadow: shadowRegistration.flow!,
            forward: forwardRegistration.flow!,
            post: postRegistration.flow!,
            ui,
            debug,
        },
        registrations: [
            transformRegistration,
            shadowRegistration,
            forwardRegistration,
            postRegistration,
            ...solvers,
        ],
    };
}
