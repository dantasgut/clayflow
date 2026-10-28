import type { FlowRegistry, FlowRegistration } from '../../scene/flows/FlowRegistry';
import type { World } from '../../scene/world/World';
import type { EventBus } from '../../scene/events/EventBus';
import { GlobalIllumination } from '../../elements/lighting/GlobalIllumination';
import { ProbeFlow } from '../../elements/lighting/ProbeFlow';
import { TemporalFilter } from '../../elements/lighting/temporal/TemporalFilter';
import { Refraction } from '../../elements/lighting/refraction/Refraction';
import { RefractionFlow } from '../../elements/lighting/refraction/RefractionFlow';
import { RefractionCompositeFlow } from './RefractionCompositeFlow';
import { RefractionDenoiseFlow } from './RefractionDenoiseFlow';
import { RefractionMotionFlow } from './RefractionMotionFlow';
import { RayScene } from '../../elements/raytrace/RayScene';
import { MaterialFunction } from '../../elements/extension/MaterialFunction';
import { LOBES } from '../../elements/material/pbr/lobes';
import type { Resource } from '../../scene/contracts/Resource';
import { ForwardFlow } from './ForwardFlow';
import { ParticleFlow } from './ParticleFlow';
import { SoftSurfaceFlow } from '../../elements/physics/flows/SoftSurfaceFlow';
import { ShadowFlow } from './ShadowFlow';
import { PostFlow } from './PostFlow';
import { UIFlow } from './UIFlow';
import { DebugFlow } from './DebugFlow';
import { TransformFlow } from '../../elements/scene/flows/TransformFlow';
import { CameraFlow } from '../../elements/scene/flows/CameraFlow';
import { ShadowMatrixFlow } from '../../elements/scene/flows/ShadowMatrixFlow';
import { MotionHistoryFlow } from '../../elements/scene/flows/MotionHistoryFlow';
import { DEFAULT_SOLVER_REGISTRATIONS } from '../../elements/physics/flows/defaultFlows';
import { FrameTargets } from '../app/FrameTargets';
import { ToneMapping } from '../resources/ToneMapping';
import { PbrTables } from '../../elements/material/pbr/PbrTables';
import { PbrTablesFlow } from '../../elements/material/pbr/PbrTablesFlow';
import { HemisphereLight } from '../../elements/scene/HemisphereLight';
import { RefractionVolumeRequestFlow } from './RefractionVolumeRequestFlow';
import { EmitterFlow } from '../../elements/particles/EmitterFlow';
import { DiffuseFlow } from '../../elements/particles/DiffuseFlow';
import { SurfaceFlow } from '../../elements/geometry/SurfaceFlow';
import { GraphGeometry } from '../../elements/geometry/GraphGeometry';
import { GraphFlow } from '../../scene/graph/GraphFlow';
import { RaySceneFlow } from '../../elements/raytrace/RaySceneFlow';
import { FluidField } from '../../elements/fields/FluidField';
import { FluidFieldFlow } from '../../elements/fields/FluidFieldFlow';
import { Froxels } from '../../elements/media/Froxels';
import { FroxelFlow } from '../../elements/media/FroxelFlow';
import { EnergyFlow } from '../../elements/physics/energy/EnergyFlow';
import { SoftEnergyFlow } from '../../elements/physics/energy/SoftEnergyFlow';
import { SkyFlow } from '../../elements/scene/sky/SkyFlow';
import {
    TemporalAntialiasing,
    type AntialiasingMode,
} from '../../elements/scene/TemporalAntialiasing';

/** Dependências dos estágios padrão: o World da cena, onde entram os alvos do quadro (`FrameTargets`). */
export interface PresentationDefaultsOptions {
    /** World da cena. */
    readonly world: World;
    /**
     * Eventos da cena: com eles, a entrada de uma `GlobalIllumination` retira o hemisfério (e garante a `RayScene`) e a
     * saída da última o devolve (spec 033, R7).
     */
    readonly events?: EventBus;
    /** Amostras por pixel dos alvos da cena (MSAA; spec 008). Default 4. */
    readonly samples?: 1 | 4;
    /** Modo do antisserrilhado da cena (spec 034). Default `'temporal'`. */
    readonly antialiasing?: AntialiasingMode;
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
    /** Post-processing chain (Bloom/Vignette/etc. em ping-pong). */
    readonly post: PostFlow;
    /** UI pass (quads + glyphs sobre o canvas). */
    readonly ui: UIFlow;
    /** Debug overlay — emite profilerStats event quando habilitado. */
    readonly debug: DebugFlow;
    /**
     * Apresentação da cena (spec 011): exposição, mapeamento de tons e saída — ajuste em `data`
     * (`defaults.presentation.data.exposure = 1`).
     */
    readonly presentation: ToneMapping;
    /**
     * Luz ambiente da cena (spec 011): o hemisfério céu/chão no lugar da constante escondida — ajuste em `data`
     * (`defaults.ambient.data.intensity = 0.5`) ou remova do World (só as luzes diretas iluminam).
     */
    readonly ambient: HemisphereLight;
    /** Alvos HDR da cena (cor, amostras, profundidade e a cópia com mips). */
    readonly targets: FrameTargets;
    /** Antisserrilhado da cena (spec 034): o modo e a sequência das posições da amostra dentro do pixel. */
    readonly antialiasing: TemporalAntialiasing;
    /** Refração traçada (spec 034): ligada e o limite de interfaces por caminho. */
    readonly refraction: Refraction;
    /**
     * Acumulador temporal de pixel (spec 037; o filtro do sinal traçado da refração, spec 034), com o antisserrilhado
     * temporal: ligado, os quadros da média e a precisão (`defaults.temporalFilter.enabled = false` mostra a amostra
     * crua).
     */
    readonly temporalFilter: TemporalFilter;
}

/** Estágios padrão de uma cena, os registros por factory, os alvos do quadro e quantas aplicações os usam. */
interface RegisteredDefaults {
    readonly defaults: PresentationDefaults;
    readonly registrations: readonly FlowRegistration[];
    readonly frameTargets: FrameTargets;
    readonly fluidField: FluidField;
    readonly froxels: Froxels;
    readonly presentation: ToneMapping;
    readonly antialiasing: TemporalAntialiasing;
    readonly refraction: Refraction;
    readonly temporalFilter: TemporalFilter;
    readonly pbrTables: PbrTables;
    readonly ambient: HemisphereLight;
    readonly world: World;
    users: number;
    /** Cancela a troca do hemisfério pela iluminação global. */
    readonly unsubscribe: (() => void) | undefined;
}

/** Estágios padrão por cena (`FlowRegistry`): registrados uma vez, desregistrados com o último usuário. */
const DEFAULTS_BY_SCENE = new WeakMap<FlowRegistry, RegisteredDefaults>();

/**
 * Registra por factory os estágios padrão da cena — Transform, Camera, ShadowMatrix, Shadow, Forward, os da água, Post,
 * Debug e UI, mais os solvers
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
    const frameTargets = new FrameTargets({ samples: options.samples ?? 4 });
    options.world.insert(frameTargets);
    // Campo dos fluidos (spec 033, R11): a superfície contínua dos corpos de fluido (a aparência pelo grafo), na GPU.
    const fluidField = new FluidField();
    options.world.insert(fluidField);
    // Froxels dos meios participantes (spec 033, R12): a névoa dos `FogVolume`, sem nada a fazer enquanto não há.
    const froxels = new Froxels();
    options.world.insert(froxels);
    // Apresentação (spec 011): o último passo do quadro, lido pelo pós pelo slot.
    const presentation = new ToneMapping();
    options.world.insert(presentation);
    // Antisserrilhado (spec 034): o estágio de câmera desloca a amostra, o pós resolve o histórico.
    const antialiasing = new TemporalAntialiasing({ mode: options.antialiasing ?? 'temporal' });
    options.world.insert(antialiasing);
    // Refração traçada (spec 034): os alvos só são alocados quando um transmissivo é desenhado.
    const refraction = new Refraction();
    options.world.insert(refraction);
    // O filtro do sinal traçado da refração (spec 034): os alvos só são alocados por quem filtra (com o temporal).
    const temporalFilter = new TemporalFilter();
    options.world.insert(temporalFilter);
    // Tabelas do sombreamento físico (spec 011): geradas na GPU uma vez pelo `PbrTablesFlow`.
    const pbrTables = new PbrTables();
    options.world.insert(pbrTables);
    // Luz ambiente de hemisfério (spec 011): no lugar da constante 0,18 do desenho Lambert.
    const ambient = new HemisphereLight();
    options.world.insert(ambient);
    const { flows: stages, registrations } = createPresentationDefaults(flows);
    const events = options.events;
    const unsubscribe =
        events === undefined
            ? undefined
            : ((): (() => void) => {
                  const offs = [
                      swapAmbientForGi(options.world, events, ambient, frameTargets),
                      raySceneForTransmissives(options.world, events),
                  ];
                  return () => {
                      for (const off of offs) off();
                  };
              })();
    const defaults: PresentationDefaults = {
        ...stages,
        presentation,
        ambient,
        targets: frameTargets,
        antialiasing,
        refraction,
        temporalFilter,
    };
    DEFAULTS_BY_SCENE.set(flows, {
        defaults,
        registrations,
        frameTargets,
        fluidField,
        froxels,
        presentation,
        antialiasing,
        refraction,
        temporalFilter,
        pbrTables,
        ambient,
        world: options.world,
        users: 1,
        unsubscribe,
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
    entry.unsubscribe?.();
    for (const registration of [...entry.registrations].reverse()) flows.unregister(registration);
    if (entry.world.entityIdOfResource(entry.ambient) !== undefined)
        entry.world.remove(entry.ambient);
    entry.world.remove(entry.pbrTables);
    entry.world.remove(entry.presentation);
    entry.world.remove(entry.antialiasing);
    entry.world.remove(entry.refraction);
    entry.world.remove(entry.temporalFilter);
    entry.world.remove(entry.fluidField);
    entry.world.remove(entry.froxels);
    entry.world.remove(entry.frameTargets);
    return true;
}

/** Lobos que fazem de uma função `material` um transmissivo (o que está atrás aparece através dele). */
const TRANSMISSIVE_LOBES = LOBES.transmission | LOBES.opacity | LOBES.translucent;

/**
 * Estrutura de raios para a refração (spec 034, R1) por evento: o que um transmissivo mostra vem do traçado, que consulta
 * a `RayScene` — com a GI desligada também. A entrada de uma função `material` transmissiva (o vidro, a água) — ou uma
 * já na cena — insere a `RayScene`, se a cena não tem. Devolve o cancelamento.
 */
function raySceneForTransmissives(world: World, events: EventBus): () => void {
    const ensure = (resources: Iterable<Resource>): void => {
        for (const r of resources) {
            const transmissive =
                r instanceof MaterialFunction && (r.lobeMask & TRANSMISSIVE_LOBES) !== 0;
            if (!transmissive) continue;
            if (world.queryBySchemaName(RayScene.schema.name).length === 0)
                world.insert(new RayScene());
            return;
        }
    };
    for (const record of world.allRecords()) ensure(record.resources);
    return events.on('resourcesChanged', (e) => {
        ensure(e.added);
    });
}

/**
 * Hemisfério e iluminação global por evento (spec 033, R7): a entrada de uma `GlobalIllumination` retira o hemisfério
 * dos estágios padrão (o céu com oclusão o substitui, sem contar o ambiente duas vezes), insere a `RayScene` que os
 * raios das sondas consultam, se a cena não tem, e liga o passe de profundidade dos `FrameTargets` (o sombreamento por
 * pixel fica caro: cada pixel sombreado uma vez); a saída da última devolve o hemisfério e o passe como estava.
 * Devolve o cancelamento.
 */
function swapAmbientForGi(
    world: World,
    events: EventBus,
    ambient: HemisphereLight,
    targets: FrameTargets,
): () => void {
    const prepass = targets.data.depthPrepass;
    const giCount = (): number => world.queryBySchemaName(GlobalIllumination.schema.name).length;
    return events.on('resourcesChanged', (e) => {
        const added = e.added.some((r) => r instanceof GlobalIllumination);
        const removed = e.removed.some((r) => r instanceof GlobalIllumination);
        if (added) {
            if (world.entityIdOfResource(ambient) !== undefined) world.remove(ambient);
            if (world.queryBySchemaName(RayScene.schema.name).length === 0)
                world.insert(new RayScene());
            if (targets.data.depthPrepass !== 1) targets.data.depthPrepass = 1;
        } else if (removed && giCount() === 0) {
            if (world.entityIdOfResource(ambient) === undefined) world.insert(ambient);
            if (targets.data.depthPrepass !== prepass) targets.data.depthPrepass = prepass;
        }
    });
}

function createPresentationDefaults(flows: FlowRegistry): {
    flows: Omit<
        PresentationDefaults,
        'presentation' | 'ambient' | 'targets' | 'antialiasing' | 'refraction' | 'temporalFilter'
    >;
    registrations: readonly FlowRegistration[];
} {
    const transformRegistration = flows.register((ctx) => new TransformFlow(ctx), {
        type: 'transform',
        phase: 'transform',
    });
    const transform = transformRegistration.flow!;
    // Tabelas do sombreamento físico antes de tudo (mesma fase, prioridade maior): integradas uma vez.
    const pbrTablesRegistration = flows.register(() => new PbrTablesFlow(), {
        type: 'pbrTables',
        phase: 'transform',
        priority: 10,
    });
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
    // Vértices das superfícies de corpos moles na mesma fase, depois da física e antes da sombra e do forward.
    const softSurfaceRegistration = flows.register((ctx) => new SoftSurfaceFlow(ctx), {
        type: 'softSurface',
        phase: 'transform',
        priority: -30,
    });
    // Superfícies paramétricas (spec 009) na mesma fase, antes da sombra e do forward.
    const surfaceRegistration = flows.register((ctx) => new SurfaceFlow(ctx), {
        type: 'parametricSurface',
        phase: 'transform',
        priority: -40,
    });
    // Grafos de nós de conjunto (spec 031) na mesma fase, depois das superfícies: escrevem a `GraphGeometry` da entidade.
    const graphRegistration = flows.register(
        (ctx) =>
            new GraphFlow(ctx, {
                target: GraphGeometry,
                owns: ['vertices', 'indices', 'wireEdges', 'indirect'],
            }),
        { type: 'setGraph', phase: 'transform', priority: -50 },
    );
    // Céu físico (spec 033) na mesma fase: tabelas da atmosfera e a vista do céu, antes da iluminação global e do desenho.
    const skyRegistration = flows.register((ctx) => new SkyFlow(ctx), {
        type: 'sky',
        phase: 'transform',
        priority: -55,
    });
    // Estrutura de raios (spec 033) depois de toda geometria escrita na GPU: registrada depois dos estágios que a
    // escrevem, o `framePrepare` dela vê as marcas de produção do quadro. Sem `RayScene` na cena fica pendente.
    // Campo dos fluidos (spec 033, R11) depois da física, antes da estrutura de raios (a caixa do volume).
    const fluidFieldRegistration = flows.register((ctx) => new FluidFieldFlow(ctx), {
        type: 'fluidField',
        phase: 'transform',
        priority: -50,
    });
    const raySceneRegistration = flows.register((ctx) => new RaySceneFlow(ctx), {
        type: 'rayScene',
        phase: 'transform',
        priority: -60,
    });
    const shadowRegistration = flows.register((ctx) => new ShadowFlow(ctx), {
        type: 'shadow',
        phase: 'shadow',
    });
    // Sondas da iluminação global (spec 033) depois do mapa de sombra: a estrutura de raios e o céu já estão prontos.
    const probeRegistration = flows.register((ctx) => new ProbeFlow(ctx), {
        type: 'globalIllumination',
        phase: 'shadow',
        priority: -5,
    });
    // Névoa (spec 033, R12) depois das sondas e da vista da luz da água (a luz rebatida e o meio até as luzes prontos).
    const froxelRegistration = flows.register((ctx) => new FroxelFlow(ctx), {
        type: 'froxels',
        phase: 'shadow',
        priority: -30,
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
    // Pedido da refração pelos volumes (spec 034, T065f): a superfície da água à frente dos opacos (ou todo pixel com a
    // câmera dentro dela) no pedido, depois do dos transmissivos (forward) e dos sprites, antes do traçado.
    const volumeRequestRegistration = flows.register(
        (ctx) => new RefractionVolumeRequestFlow(ctx),
        {
            type: 'refractionVolumeRequest',
            phase: 'forward',
            priority: -61,
        },
    );
    // Refração traçada (spec 034, R1): depois do pedido dos transmissivos (forward), dos sprites e do pedido pelos
    // volumes.
    const refractionRegistration = flows.register((ctx) => new RefractionFlow(ctx), {
        type: 'refraction',
        phase: 'forward',
        priority: -65,
    });
    // Filtro do sinal traçado da refração (T044a), com o antisserrilhado temporal: entre o traçado e a composição, que
    // lê a cor filtrada.
    const refractionDenoiseRegistration = flows.register((ctx) => new RefractionDenoiseFlow(ctx), {
        type: 'refractionDenoise',
        phase: 'forward',
        priority: -66,
    });
    // Composição da refração traçada (T045) logo depois do traçado, antes da água: a água e a resolução veem a cor e a
    // profundidade dos transmissivos.
    const refractionCompositeRegistration = flows.register(
        (ctx) => new RefractionCompositeFlow(ctx),
        { type: 'refractionComposite', phase: 'forward', priority: -67 },
    );
    // Movimento do que a refração mostra (T044a), antes da água (que mistura o movimento dela sobre o do fundo).
    const refractionMotionRegistration = flows.register((ctx) => new RefractionMotionFlow(ctx), {
        type: 'refractionMotion',
        phase: 'forward',
        priority: -68,
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
    // Emissores de partículas na GPU (spec 009) depois dos solvers: integram os mesmos campos.
    const emitterRegistration = flows.register((ctx) => new EmitterFlow(ctx), {
        type: 'emitters',
        phase: 'physics',
        priority: -100,
    });
    // Partículas secundárias dos fluidos (spec 010: spray, espuma, bolhas) depois dos solvers, antes dos emissores.
    const diffuseRegistration = flows.register((ctx) => new DiffuseFlow(ctx), {
        type: 'diffuse',
        phase: 'physics',
        priority: -50,
    });
    // Histórico de movimento (spec 034): a primeira coisa do quadro (fase `physics`, maior prioridade), antes de qualquer
    // escrita nas matrizes de mundo.
    const motionHistoryRegistration = flows.register((ctx) => new MotionHistoryFlow(ctx), {
        type: 'motionHistory',
        phase: 'physics',
        priority: 1000,
    });
    // A energia dos corpos rígidos (spec 037) depois dos solvers: só com um `EnergyMeter` na cena.
    flows.register((ctx) => new EnergyFlow(ctx), {
        type: 'energy',
        phase: 'physics',
        priority: 0,
    });
    // A dos corpos moles (spec 037) depois de todos os solvers (os de prioridade 0 se registram depois): idem.
    flows.register((ctx) => new SoftEnergyFlow(ctx), {
        type: 'softEnergy',
        phase: 'physics',
        priority: -10,
    });
    // Solvers padrão por factory: a C2 instancia cada um no primeiro corpo do seu tipo.
    const solvers = DEFAULT_SOLVER_REGISTRATIONS.map((r) => flows.register(r.factory, r.options));
    return {
        flows: {
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
            motionHistoryRegistration,
            transformRegistration,
            pbrTablesRegistration,
            cameraRegistration,
            shadowMatrixRegistration,
            softSurfaceRegistration,
            surfaceRegistration,
            graphRegistration,
            skyRegistration,
            fluidFieldRegistration,
            raySceneRegistration,
            shadowRegistration,
            probeRegistration,
            froxelRegistration,
            forwardRegistration,
            particleRegistration,
            volumeRequestRegistration,
            refractionRegistration,
            refractionDenoiseRegistration,
            refractionCompositeRegistration,
            refractionMotionRegistration,
            postRegistration,
            debugRegistration,
            uiRegistration,
            emitterRegistration,
            diffuseRegistration,
            ...solvers,
        ],
    };
}
