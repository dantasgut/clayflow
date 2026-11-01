import { wgslModule } from '../../scene/shaders/WgslModule';
import {
    wgslResource,
    type WgslResource,
    type WgslResourceType,
} from '../../scene/shaders/WgslResource';
import { NONE, WORKGROUP_SIZE } from '../../scene/shaders/engineConstants';
import giCommonSource from '../gpu/wgsl/gi/gi_common.wgsl?raw';
import giWeightsSource from '../gpu/wgsl/gi/gi_weights.wgsl?raw';
import giSampleSource from '../gpu/wgsl/gi/gi_sample.wgsl?raw';
import giGenerationSource from '../gpu/wgsl/gi/gi_generation.wgsl?raw';
import giDirectSource from '../gpu/wgsl/gi/gi_direct.wgsl?raw';
import giProbeTraceSource from '../gpu/wgsl/gi/gi_probe_trace.wgsl?raw';
import giProbeBlendSource from '../gpu/wgsl/gi/gi_probe_blend.wgsl?raw';
import giProbeClassifySource from '../gpu/wgsl/gi/gi_probe_classify.wgsl?raw';
import giProbeAtlasSource from '../gpu/wgsl/gi/gi_probe_atlas.wgsl?raw';
import giShadeSource from '../gpu/wgsl/gi/gi_shade.wgsl?raw';
import giResponseSource from '../gpu/wgsl/gi/gi_response.wgsl?raw';
import giScreenCommonSource from '../gpu/wgsl/gi/gi_screen_common.wgsl?raw';
import giScreenPlaceSource from '../gpu/wgsl/gi/gi_screen_place.wgsl?raw';
import giScreenTraceSource from '../gpu/wgsl/gi/gi_screen_trace.wgsl?raw';
import giScreenGuideSource from '../gpu/wgsl/gi/gi_screen_guide.wgsl?raw';
import giScreenResolveSource from '../gpu/wgsl/gi/gi_screen_resolve.wgsl?raw';
import giScreenSampleSource from '../gpu/wgsl/gi/gi_screen_sample.wgsl?raw';
import giScreenReprojectSource from '../gpu/wgsl/gi/gi_screen_reproject.wgsl?raw';
import giWaveDirectSource from '../gpu/wgsl/gi/gi_wave_direct.wgsl?raw';
import { closure, closureEval } from '../material/pbr/shaders';
import { causticsCapable } from './caustics/shaders';
import { rayDirect, rayHit, rayScene } from '../raytrace/shaders';
import { RayWaveEntrySchema, rayWave, rayWaveResources } from '../raytrace/wave/shaders';
import { cameraSpace } from '../scene/flows/shaders';
import { sceneEnvironmentReady } from '../scene/points/lighting';
import { rayVolumeTransmittanceReady } from '../raytrace/points';
import { camerasResource } from '../scene/resources';
import { GiScreenFilterStepSchema, GlobalIlluminationSchema, ProbeStateSchema } from './schemas';
import { slot } from '../../scene/flows/slots';
import {
    basis,
    color,
    constants,
    random,
    sampling,
    temporal as temporalPieces,
    viewSpace,
    xformRigid,
} from '../gpu/shaders/math';

// Módulos da iluminação global (spec 033, R2/R5/R6/R7): as sondas (endereçamento, pesos, leitura dos atlas e dos
// rebatimentos), o material e a luz direta nos acertos, os kernels das sondas (raios, acúmulo, estado, atlas) e a leitura
// para o desenho. Os descritores da `GlobalIllumination` vêm dos resolvers `GlobalIllumination.*`; os buffers dos raios
// e dos rebatimentos são privados do `ProbeFlow`.

/** Parâmetros da iluminação global (resolver `GlobalIllumination.params`). */
export const giParamsResource = wgslResource({
    name: 'gi',
    binding: { uniform: true },
    type: { schema: GlobalIlluminationSchema },
    frequency: 'frame',
    provider: { consumer: 'GlobalIllumination.params' },
});

const probes = (access: 'read' | 'read_write'): WgslResource =>
    wgslResource({
        name: 'gi_probes',
        binding: { storage: access },
        type: { schema: ProbeStateSchema, array: true },
        frequency: 'frame',
        provider: { consumer: 'GlobalIllumination.probes' },
    });

const atlas = (name: string, consumer: string): WgslResource =>
    wgslResource({
        name,
        binding: { texture: { sample: 'f32' } },
        frequency: 'frame',
        provider: { consumer },
    });

const out = (name: string, format: GPUTextureFormat = 'rgba16float'): WgslResource =>
    wgslResource({
        name,
        binding: { storageTexture: { format, access: 'write' } },
        frequency: 'stage',
        provider: 'private',
    });

const priv = (name: string, access: 'read' | 'read_write', type: WgslResourceType): WgslResource =>
    wgslResource({
        name,
        binding: { storage: access },
        type,
        frequency: 'stage',
        provider: 'private',
    });

/** Recursos da iluminação global. */
export const giResources = Object.freeze({
    params: giParamsResource,
    probes: probes('read'),
    probesWrite: probes('read_write'),
    irradianceAtlas: atlas('gi_irradiance_atlas', 'GlobalIllumination.irradiance'),
    radianceAtlas: atlas('gi_radiance_atlas', 'GlobalIllumination.radiance'),
    visibilityAtlas: atlas('gi_visibility_atlas', 'GlobalIllumination.visibility'),
    sampler: wgslResource({
        name: 'gi_sampler',
        binding: { sampler: 'filtering' },
        frequency: 'frame',
        provider: { consumer: 'GlobalIllumination.sampler' },
    }),
    probeTexture: atlas('gi_probe_texture', 'GlobalIllumination.probeTexture'),
    probeOut: out('gi_probe_out'),
    irradianceOut: out('gi_irradiance_out'),
    radianceOut: out('gi_radiance_out'),
    visibilityOut: out('gi_visibility_out'),
    rays: priv('gi_rays', 'read_write', { wgsl: 'vec4f', array: true }),
    raysRead: priv('gi_rays', 'read', { wgsl: 'vec4f', array: true }),
    generations: priv('gi_generations', 'read_write', { wgsl: 'vec2u', array: true }),
    generationsRead: priv('gi_generations', 'read', { wgsl: 'vec2u', array: true }),
    radianceMap: priv('gi_radiance_map', 'read_write', { wgsl: 'vec2u', array: true }),
    /** A histerese de cada sonda atualizada no quadro (spec 034, T049): o passe da resposta grava, o acúmulo lê. */
    probeHysteresis: priv('gi_probe_hysteresis', 'read_write', { wgsl: 'f32', array: true }),
    radianceMapRead: priv('gi_radiance_map', 'read', { wgsl: 'vec2u', array: true }),
    visibilityMap: priv('gi_visibility_map', 'read_write', { wgsl: 'u32', array: true }),
    visibilityMapRead: priv('gi_visibility_map', 'read', { wgsl: 'u32', array: true }),
    // Coleta final na tela (R2 adendo): as texturas das sondas de tela que o desenho lê, as saídas e o trabalho do
    // quadro (sondas e raios; privados do `ProbeFlow`).
    screenProbe: atlas('gi_screen_probe_texture', 'GlobalIllumination.screenProbe'),
    screenIrradiance: atlas('gi_screen_irradiance_texture', 'GlobalIllumination.screenIrradiance'),
    /** O filtro à-trous das sondas de tela (T054): duas metades de ida e volta, irradiância e variância por sonda. */
    screenFilter: priv('gi_screen_filter', 'read_write', { wgsl: 'vec4f', array: true }),
    /** O passe do filtro: uma região por passe, por offset dinâmico (spec 039). */
    screenFilterStep: wgslResource({
        name: 'gi_screen_filter_step',
        binding: { uniform: true },
        type: { schema: GiScreenFilterStepSchema },
        frequency: 'draw',
        provider: 'private',
    }),
    screenProbeOut: out('gi_screen_probe_out', 'rgba32float'),
    screenIrradianceOut: out('gi_screen_irradiance_out'),
    screenWork: priv('gi_screen_work', 'read_write', { wgsl: 'vec4f', array: true }),
    screenWorkRead: priv('gi_screen_work', 'read', { wgsl: 'vec4f', array: true }),
    /** A luz direta nos acertos da onda por raio (spec 034 T078; privada do `ProbeFlow`). */
    waveDirect: priv('gi_wave_light', 'read_write', { wgsl: 'vec4f', array: true }),
    waveDirectRead: priv('gi_wave_light_read', 'read', { wgsl: 'vec4f', array: true }),
    /** O histórico do acúmulo (canal temporal, spec 037): a fatia do quadro (escrita) e a do anterior (lida). */
    screenHistory: wgslResource({
        name: 'gi_screen_history',
        binding: { storage: 'read_write' },
        type: { wgsl: 'vec4f', array: true },
        frequency: 'stage',
        provider: { slot: 'giScreenHistory', lag: 0 },
    }),
    screenHistoryPrevious: wgslResource({
        name: 'gi_screen_history_previous',
        binding: { storage: 'read' },
        type: { wgsl: 'vec4f', array: true },
        frequency: 'stage',
        provider: { slot: 'giScreenHistory', lag: 1 },
    }),
});

const R = giResources;

/** Endereçamento das sondas, mapeamento octaédrico, atlas e raios. */
export const giCommon = wgslModule({
    name: 'gi_common',
    source: giCommonSource,
    requires: [R.params, constants],
});

/** Pesos das sondas num ponto (trilinear, voltada para a normal, Chebyshev) e as cascatas. */
export const giWeights = wgslModule({
    name: 'gi_weights',
    source: giWeightsSource,
    requires: [giCommon, R.params, R.probeTexture, R.visibilityAtlas, R.sampler],
});

/** Irradiância e radiância especular das sondas num ponto, pelos atlas filtrados (o desenho). */
export const giSample = wgslModule({
    name: 'gi_sample',
    source: giSampleSource,
    requires: [giCommon, giWeights, R.params, R.irradianceAtlas, R.radianceAtlas, R.sampler],
});

/** Irradiância de um rebatimento anterior num ponto, pelos buffers das sondas (os acertos). */
const giGeneration = wgslModule({
    name: 'gi_generation',
    source: giGenerationSource,
    requires: [color, giCommon, giWeights, R.params, R.generationsRead],
});

/** Luz direta no ponto atingido (sombra pela estrutura de raios). */
const giDirect = wgslModule({
    name: 'gi_direct',
    source: giDirectSource,
    requires: [random, R.params, closure, rayDirect],
});

/** Luz que sai de um ponto atingido: a direta, a emissão e o rebatimento anterior das sondas do mundo. */
const giShade = wgslModule({
    name: 'gi_shade',
    source: giShadeSource,
    requires: [giDirect, causticsCapable, giGeneration, closure, closureEval],
});

/** O slot do canal do histórico das sondas de tela no estágio das sondas (spec 037). */
export const giScreenHistorySlot = Object.freeze({
    giScreenHistory: slot.channel(GlobalIlluminationSchema, 'screenHistory'),
});

/** Sondas de tela: ladrilhos, buffer de trabalho e o raio da câmera ativa. */
const giScreenCommon = wgslModule({
    name: 'gi_screen_common',
    source: giScreenCommonSource,
    requires: [R.params, cameraSpace],
});

/** Histórico das sondas de tela: o layout e a busca da sonda do quadro anterior num ponto. */
const giScreenReproject = wgslModule({
    name: 'gi_screen_reproject',
    source: giScreenReprojectSource,
    requires: [
        temporalPieces,
        viewSpace,
        xformRigid,
        NONE.module,
        R.params,
        giScreenCommon,
        R.screenHistoryPrevious,
        camerasResource,
    ],
});

/** Raios das sondas atualizadas no quadro. */
export const giProbeTrace = wgslModule({
    name: 'gi_probe_trace',
    source: giProbeTraceSource,
    requires: [
        WORKGROUP_SIZE.module,
        giCommon,
        giWeights,
        R.params,
        rayScene,
        rayHit,
        giShade,
        giScreenReproject,
        closureEval,
        sceneEnvironmentReady,
        rayVolumeTransmittanceReady,
        rayWave,
        R.rays,
        R.waveDirectRead,
    ],
});

/**
 * A luz direta nos acertos da onda (spec 034 T078): o kernel que liga as luzes, a estrutura de raios e os contribuintes
 * da luz, fora dos que somam os rebatimentos.
 */
export const giWaveDirect = wgslModule({
    name: 'gi_wave_direct',
    source: giWaveDirectSource,
    requires: [
        random,
        WORKGROUP_SIZE.module,
        NONE.module,
        R.params,
        giCommon,
        giShade,
        rayWaveResources.entriesIn,
        rayWaveResources.counts,
        R.waveDirect,
    ],
    structs: [RayWaveEntrySchema],
});

/** Histerese adaptativa das sondas (a regra de `reference/response.ts`). */
const giResponse = wgslModule({ name: 'gi_response', source: giResponseSource, requires: [color] });

/** Acúmulo dos raios nos mapas das sondas. */
export const giProbeBlend = wgslModule({
    name: 'gi_probe_blend',
    source: giProbeBlendSource,
    requires: [
        color,
        WORKGROUP_SIZE.module,
        giCommon,
        giResponse,
        R.params,
        R.probesWrite,
        R.raysRead,
        R.generations,
        R.radianceMap,
        R.visibilityMap,
        R.probeHysteresis,
    ],
});

/** Estado e relocação das sondas. */
export const giProbeClassify = wgslModule({
    name: 'gi_probe_classify',
    source: giProbeClassifySource,
    requires: [WORKGROUP_SIZE.module, giCommon, R.params, R.probesWrite, R.raysRead],
});

/** Cópia dos mapas para os atlas filtrados. */
export const giProbeAtlas = wgslModule({
    name: 'gi_probe_atlas',
    source: giProbeAtlasSource,
    requires: [
        color,
        WORKGROUP_SIZE.module,
        giCommon,
        R.params,
        R.probes,
        R.generationsRead,
        R.radianceMapRead,
        R.visibilityMapRead,
        R.irradianceOut,
        R.radianceOut,
        R.visibilityOut,
        R.probeOut,
    ],
});

/** Colocação das sondas de tela pelo raio da câmera. */
export const giScreenPlace = wgslModule({
    name: 'gi_screen_place',
    source: giScreenPlaceSource,
    requires: [WORKGROUP_SIZE.module, R.params, giScreenCommon, rayScene, R.screenWork],
});

/**
 * As direções dos raios das sondas de tela (spec 034, T051): metade em cosseno, metade guiada pela radiância da sonda do
 * mundo de maior peso, com o peso MIS de cada raio.
 */
export const giScreenGuide = wgslModule({
    name: 'gi_screen_guide',
    source: giScreenGuideSource,
    requires: [
        random,
        basis,
        sampling,
        color,
        WORKGROUP_SIZE.module,
        R.params,
        giCommon,
        giWeights,
        giScreenCommon,
        R.radianceMapRead,
        R.screenWork,
    ],
});

/** Raios das sondas de tela. */
export const giScreenTrace = wgslModule({
    name: 'gi_screen_trace',
    source: giScreenTraceSource,
    requires: [
        random,
        WORKGROUP_SIZE.module,
        NONE.module,
        R.params,
        giCommon,
        giScreenCommon,
        giScreenReproject,
        rayScene,
        rayHit,
        giShade,
        giDirect,
        closureEval,
        sceneEnvironmentReady,
        rayVolumeTransmittanceReady,
        rayWave,
        R.screenWork,
        R.waveDirectRead,
    ],
});

/** Acúmulo das sondas de tela e a vista-projeção para o quadro seguinte. */
export const giScreenResolve = wgslModule({
    name: 'gi_screen_resolve',
    source: giScreenResolveSource,
    requires: [
        WORKGROUP_SIZE.module,
        NONE.module,
        R.params,
        giScreenCommon,
        giScreenReproject,
        giResponse,
        temporalPieces,
        camerasResource,
        R.screenHistory,
        R.screenWorkRead,
        giCommon,
        R.screenProbeOut,
        R.screenIrradianceOut,
        R.screenFilter,
        R.screenFilterStep,
        color,
    ],
});

/** Irradiância das sondas de tela num ponto, com a confiança (o desenho). */
export const giScreenSample = wgslModule({
    name: 'gi_screen_sample',
    source: giScreenSampleSource,
    requires: [viewSpace, R.params, giCommon, camerasResource, R.screenProbe, R.screenIrradiance],
});
