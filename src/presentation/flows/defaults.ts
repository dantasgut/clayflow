import type { FlowRegistry, FlowRegistration } from '../../scene/flows/FlowRegistry';
import type { World } from '../../scene/world/World';
import { ForwardFlow } from './ForwardFlow';
import { ParticleFlow } from './ParticleFlow';
import { ShadowFlow } from './ShadowFlow';
import { PostFlow } from './PostFlow';
import { UIFlow } from './UIFlow';
import { DebugFlow } from './DebugFlow';
import { TransformFlow } from '../../elements/scene/flows/TransformFlow';
import { CameraFlow } from '../../elements/scene/flows/CameraFlow';
import { ShadowMatrixFlow } from '../../elements/scene/flows/ShadowMatrixFlow';
import { DEFAULT_SOLVER_REGISTRATIONS } from '../../elements/physics/flows/defaultFlows';
import { FrameTargets } from '../app/FrameTargets';

/** Dependências dos estágios padrão: o World da cena, onde entram os alvos do quadro (`FrameTargets`). */
export interface PresentationDefaultsOptions {
    /** World da cena. */
    readonly world: World;
}

/**
 * Bag dos Flows default registrados pelo Application. Permite o app
 * customizar diretamente (e.g. `defaults.post.addEffect(new Bloom(...))`,
 * `defaults.debug.setEnabled(true)`).
 */
export interface PresentationDefaults {
    /** Estágio de transformação (fase `transform`): intenção dos Transform → matrizes de mundo. */
    readonly transform: TransformFlow;
    /** Estágio de câmera (fase `transform`, depois da composição): parâmetros + Transform → matrizes da câmera. */
    readonly camera: CameraFlow;
    /** Estágio da matriz de sombra (fase `transform`, depois da câmera): direção da luz → matriz do `ShadowMap`. */
    readonly shadowMatrix: ShadowMatrixFlow;
    /** Render principal: desenha a cena nos `FrameTargets` (câmera, mundo, materiais e sombra pelos slots). */
    readonly forward: ForwardFlow;
    /** Corpos de partículas em sprites (fase `forward`, depois do forward), lidos direto dos pools dos corpos. */
    readonly particles: ParticleFlow;
    /** Passe de profundidade do ponto de vista da luz que projeta sombra, no `ShadowMap` dela. */
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
 * Registra por factory os estágios padrão da cena — Transform, Camera, ShadowMatrix, Shadow, Forward, Post, Debug e UI, mais os solvers
 * padrão — e insere os alvos do quadro (`FrameTargets`: o render principal desenha neles, o pós-processamento os lê
 * pelo slot). **Uma vez por cena**: chamadas seguintes com o mesmo `FlowRegistry` devolvem os mesmos estágios e
 * contam mais um usuário (várias aplicações na mesma cena não duplicam estágios). Cada chamada deve ser pareada com
 * `releasePresentationDefaults`.
 *
 * A ordem no quadro vem das fases (`transform → shadow → forward → post → ui`) e da prioridade dentro delas.
 *
 * Chamado por `Application.create`. Apps que querem outro pipeline podem registrar as suas factories
 * (`flows.register`/`flows.override`).
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
    const { defaults, registrations } = createPresentationDefaults(flows);
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
    for (const registration of [...entry.registrations].reverse()) flows.unregister(registration);
    entry.world.remove(entry.frameTargets);
    return true;
}

function createPresentationDefaults(flows: FlowRegistry): {
    defaults: PresentationDefaults;
    registrations: readonly FlowRegistration[];
} {
    const transformRegistration = flows.register((ctx) => new TransformFlow(ctx), {
        type: 'transform',
        phase: 'transform',
    });
    const transform = transformRegistration.flow!;
    // Câmera depois da composição dos Transform (mesma fase, prioridade menor): lê a matriz de mundo da câmera.
    const cameraRegistration = flows.register((ctx) => new CameraFlow(ctx), {
        type: 'camera',
        phase: 'transform',
        priority: -10,
    });
    // Matriz de sombra depois da câmera (mesma fase): lê a direção da luz no pool `Light`.
    const shadowMatrixRegistration = flows.register((ctx) => new ShadowMatrixFlow(ctx), {
        type: 'shadowMatrix',
        phase: 'transform',
        priority: -20,
    });
    const shadowRegistration = flows.register((ctx) => new ShadowFlow(ctx), {
        type: 'shadow',
        phase: 'shadow',
    });
    const forwardRegistration = flows.register((ctx) => new ForwardFlow(ctx, { output: 'scene' }), {
        type: 'forward',
        phase: 'forward',
    });
    // Corpos de partículas em sprites depois do forward (mesma fase, prioridade menor): lê a profundidade da cena.
    const particleRegistration = flows.register((ctx) => new ParticleFlow(ctx), {
        type: 'particles',
        phase: 'forward',
        priority: -50,
    });
    const postRegistration = flows.register((ctx) => new PostFlow(ctx), {
        type: 'post',
        phase: 'post',
    });
    const debugRegistration = flows.register((ctx) => new DebugFlow(ctx), {
        type: 'debug',
        phase: 'forward',
        priority: -100,
    });
    const uiRegistration = flows.register((ctx) => new UIFlow(ctx), { type: 'ui', phase: 'ui' });
    // Solvers padrão por factory: a C2 instancia cada um no primeiro corpo do seu tipo.
    const solvers = DEFAULT_SOLVER_REGISTRATIONS.map((r) => flows.register(r.factory, r.options));
    return {
        defaults: {
            transform,
            camera: cameraRegistration.flow!,
            shadowMatrix: shadowMatrixRegistration.flow!,
            shadow: shadowRegistration.flow!,
            forward: forwardRegistration.flow!,
            particles: particleRegistration.flow!,
            post: postRegistration.flow!,
            ui: uiRegistration.flow!,
            debug: debugRegistration.flow!,
        },
        registrations: [
            transformRegistration,
            cameraRegistration,
            shadowMatrixRegistration,
            shadowRegistration,
            forwardRegistration,
            particleRegistration,
            postRegistration,
            debugRegistration,
            uiRegistration,
            ...solvers,
        ],
    };
}
