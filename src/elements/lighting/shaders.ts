import { wgslModule } from '../../scene/shaders/WgslModule';
import {
    wgslResource,
    type WgslResource,
    type WgslResourceType,
} from '../../scene/shaders/WgslResource';
import type { BindablePoint } from '../../scene/shaders/bindPoints';
import { NONE, WORKGROUP_SIZE } from '../../scene/shaders/engineConstants';
import giCommonSource from '../gpu/wgsl/gi/gi_common.wgsl?raw';
import giWeightsSource from '../gpu/wgsl/gi/gi_weights.wgsl?raw';
import giSampleSource from '../gpu/wgsl/gi/gi_sample.wgsl?raw';
import giGenerationSource from '../gpu/wgsl/gi/gi_generation.wgsl?raw';
import giHitSource from '../gpu/wgsl/gi/gi_hit.wgsl?raw';
import giHitMaterialReadySource from '../gpu/wgsl/gi/gi_hit_material_ready.wgsl?raw';
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
import giScreenResolveSource from '../gpu/wgsl/gi/gi_screen_resolve.wgsl?raw';
import giScreenSampleSource from '../gpu/wgsl/gi/gi_screen_sample.wgsl?raw';
import giScreenReprojectSource from '../gpu/wgsl/gi/gi_screen_reproject.wgsl?raw';
import giPhotonCommonSource from '../gpu/wgsl/gi/gi_photon_common.wgsl?raw';
import giPhotonSource from '../gpu/wgsl/gi/gi_photon.wgsl?raw';
import giPhotonTraceSource from '../gpu/wgsl/gi/gi_photon_trace.wgsl?raw';
import giPhotonResolveSource from '../gpu/wgsl/gi/gi_photon_resolve.wgsl?raw';
import { rayVolumeHitReady } from '../raytrace/points';
import { closure, closureEval } from '../material/pbr/shaders';
import { materialPointTypes } from '../material/point/types/shaders';
import { StandardMaterialSchema } from '../material/StandardMaterialSchema';
import { rayInstanceRead, rayScene } from '../raytrace/shaders';
import { lightTransmissionReady, sceneEnvironmentReady } from '../scene/points/lighting';
import { rayVolumeTransmittanceReady } from '../raytrace/points';
import { LIGHT_LIMIT, lightIncoming } from '../scene/points/lightContributions';
import { camerasResource, lightsResource } from '../scene/resources';
import { GlobalIlluminationSchema, ProbeStateSchema } from './schemas';

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
    radianceMapRead: priv('gi_radiance_map', 'read', { wgsl: 'vec2u', array: true }),
    visibilityMap: priv('gi_visibility_map', 'read_write', { wgsl: 'u32', array: true }),
    visibilityMapRead: priv('gi_visibility_map', 'read', { wgsl: 'u32', array: true }),
    // Coleta final na tela (R2 adendo): as texturas das sondas de tela que o desenho lê, as saídas, o trabalho do
    // quadro (sondas e raios) e o histórico do acúmulo (privados do `ProbeFlow`).
    screenProbe: atlas('gi_screen_probe_texture', 'GlobalIllumination.screenProbe'),
    screenIrradiance: atlas('gi_screen_irradiance_texture', 'GlobalIllumination.screenIrradiance'),
    screenProbeOut: out('gi_screen_probe_out', 'rgba32float'),
    screenIrradianceOut: out('gi_screen_irradiance_out'),
    screenWork: priv('gi_screen_work', 'read_write', { wgsl: 'vec4f', array: true }),
    screenWorkRead: priv('gi_screen_work', 'read', { wgsl: 'vec4f', array: true }),
    screenHistory: priv('gi_screen_history', 'read_write', { wgsl: 'vec4f', array: true }),
    // As instâncias capazes de cáustica e as áreas das projeções delas (privado do `ProbeFlow`; US5).
    photonTargets: priv('gi_photon_targets', 'read_write', { wgsl: 'f32', array: true }),
    // Cáusticas por fótons (US5): o hash em mundo — leitura no desenho, atômicos nos fótons e no acúmulo.
    caustics: wgslResource({
        name: 'gi_caustics',
        binding: { storage: 'read' },
        type: { wgsl: 'u32', array: true },
        frequency: 'frame',
        provider: { consumer: 'GlobalIllumination.caustics' },
    }),
    causticsWrite: wgslResource({
        name: 'gi_caustics_atomic',
        binding: { storage: 'read_write' },
        type: { wgsl: 'atomic<u32>', array: true },
        frequency: 'frame',
        provider: { consumer: 'GlobalIllumination.caustics' },
    }),
});

const R = giResources;

/** Endereçamento das sondas, mapeamento octaédrico, atlas e raios. */
export const giCommon = wgslModule({
    name: 'gi_common',
    source: giCommonSource,
    requires: [R.params],
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
    requires: [giCommon, giWeights, R.params, R.generationsRead],
});

/** Composição pronta das funções `material` nos acertos: as constantes do material. */
export const giHitMaterialReady = wgslModule({
    name: 'gi_hit_material_ready',
    source: giHitMaterialReadySource,
    requires: [materialPointTypes, closure],
    structs: [StandardMaterialSchema],
});

/**
 * Ponto da composição das funções `material` nos acertos (spec 033, R3): o `ProbeFlow` troca o pronto pelo `switch`
 * das funções da cena (`bindPoints`).
 */
export const giHitMaterialPoint: BindablePoint = {
    name: 'gi_hit_material',
    ready: giHitMaterialReady,
};

/** Material no ponto atingido. */
const giHit = wgslModule({
    name: 'gi_hit',
    source: giHitSource,
    requires: [
        rayScene,
        rayInstanceRead,
        R.params,
        materialPointTypes,
        closure,
        giHitMaterialReady,
    ],
    structs: [StandardMaterialSchema],
});

/** Luz direta no ponto atingido (sombra pela estrutura de raios). */
const giDirect = wgslModule({
    name: 'gi_direct',
    source: giDirectSource,
    requires: [
        NONE.module,
        R.params,
        closure,
        closureEval,
        rayScene,
        lightsResource,
        LIGHT_LIMIT.module,
        lightIncoming,
        lightTransmissionReady,
    ],
});

/** Luz que sai de um ponto atingido: a direta, a emissão e o rebatimento anterior das sondas do mundo. */
const giShade = wgslModule({
    name: 'gi_shade',
    source: giShadeSource,
    requires: [giDirect, giGeneration, closure, closureEval],
});

/** Sondas de tela: ladrilhos, buffer de trabalho e o raio da câmera ativa. */
const giScreenCommon = wgslModule({
    name: 'gi_screen_common',
    source: giScreenCommonSource,
    requires: [R.params, camerasResource],
});

/** Histórico das sondas de tela: o layout e a busca da sonda do quadro anterior num ponto. */
const giScreenReproject = wgslModule({
    name: 'gi_screen_reproject',
    source: giScreenReprojectSource,
    requires: [NONE.module, R.params, giScreenCommon, R.screenHistory],
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
        giHit,
        giShade,
        giScreenReproject,
        closureEval,
        sceneEnvironmentReady,
        rayVolumeTransmittanceReady,
        R.rays,
    ],
});

/** Histerese adaptativa das sondas (a regra de `reference/response.ts`). */
const giResponse = wgslModule({ name: 'gi_response', source: giResponseSource });

/** Acúmulo dos raios nos mapas das sondas. */
export const giProbeBlend = wgslModule({
    name: 'gi_probe_blend',
    source: giProbeBlendSource,
    requires: [
        WORKGROUP_SIZE.module,
        giCommon,
        giResponse,
        R.params,
        R.probesWrite,
        R.raysRead,
        R.generations,
        R.radianceMap,
        R.visibilityMap,
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

/** Raios das sondas de tela. */
export const giScreenTrace = wgslModule({
    name: 'gi_screen_trace',
    source: giScreenTraceSource,
    requires: [
        WORKGROUP_SIZE.module,
        NONE.module,
        R.params,
        giCommon,
        giScreenCommon,
        giScreenReproject,
        rayScene,
        giHit,
        giShade,
        giDirect,
        closureEval,
        sceneEnvironmentReady,
        rayVolumeTransmittanceReady,
        R.screenWork,
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
        camerasResource,
        R.screenWorkRead,
        giCommon,
        R.screenProbeOut,
        R.screenIrradianceOut,
    ],
});

/** Irradiância das sondas de tela num ponto, com a confiança (o desenho). */
export const giScreenSample = wgslModule({
    name: 'gi_screen_sample',
    source: giScreenSampleSource,
    requires: [R.params, giCommon, camerasResource, R.screenProbe, R.screenIrradiance],
});

/** Chave, balde e endereços do hash das cáusticas por fótons (US5). */
const giPhotonCommon = wgslModule({
    name: 'gi_photon_common',
    source: giPhotonCommonSource,
    requires: [R.params],
});

/** Irradiância das cáusticas num ponto (o desenho). */
export const giPhoton = wgslModule({
    name: 'gi_photon',
    source: giPhotonSource,
    requires: [R.params, giPhotonCommon, R.caustics],
});

/** Fótons das fontes pelos caminhos especulares até a primeira difusa (com a composição das funções `material`). */
export const giPhotonTrace = wgslModule({
    name: 'gi_photon_trace',
    source: giPhotonTraceSource,
    requires: [
        WORKGROUP_SIZE.module,
        NONE.module,
        giCommon,
        R.params,
        giPhotonCommon,
        R.causticsWrite,
        R.photonTargets,
        rayScene,
        giHit,
        giDirect,
        rayVolumeHitReady,
        rayVolumeTransmittanceReady,
    ],
});

/** Acúmulo das cáusticas no hash. */
export const giPhotonResolve = wgslModule({
    name: 'gi_photon_resolve',
    source: giPhotonResolveSource,
    requires: [WORKGROUP_SIZE.module, R.params, giPhotonCommon, R.causticsWrite],
});
