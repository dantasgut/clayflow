import { POINT_PARAMS, wgslPoint } from '../../../scene/shaders/WgslPoint';
import type { BindablePoint } from '../../../scene/shaders/bindPoints';
import { wgslModule, type WgslModule } from '../../../scene/shaders/WgslModule';
import { wgslResource, type WgslResource } from '../../../scene/shaders/WgslResource';
import { slot } from '../../../scene/flows/slots';
import { camerasResource } from '../../scene/resources';
import { cameraSpace } from '../../scene/flows/shaders';
import {
    sky,
    skyAerialFarVisibilityPoint,
    skyAerialLookup,
    skyParamsResource,
} from '../../scene/sky/shaders';
import { bindPoints } from '../../../scene/shaders/bindPoints';
import { sceneNearFogReady } from '../../scene/points/media';
import { color, constants, random, viewSpace, xformRigid } from '../../gpu/shaders/math';
import { WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import { sharedConstant } from '../../../scene/shaders/SharedConstant';
import { CloudSchema, CloudShadowPageSchema, CloudShadowPageViewSchema } from './schemas';
import cloudCommonSource from '../../gpu/wgsl/clouds/cloud_common.wgsl?raw';
import cloudPhaseSource from '../../gpu/wgsl/clouds/cloud_phase.wgsl?raw';
import cloudDensitySource from '../../gpu/wgsl/clouds/cloud_density.wgsl?raw';
import cloudShadowLookupSource from '../../gpu/wgsl/clouds/cloud_shadow_lookup.wgsl?raw';
import cloudShadowPagesSource from '../../gpu/wgsl/clouds/cloud_shadow_pages.wgsl?raw';
import cloudLightSource from '../../gpu/wgsl/clouds/cloud_light.wgsl?raw';
import cloudIntegrateSource from '../../gpu/wgsl/clouds/cloud_integrate.wgsl?raw';
import cloudLightListSource from '../../gpu/wgsl/clouds/cloud_light_list.wgsl?raw';
import cloudLightSamplesSource from '../../gpu/wgsl/clouds/cloud_light_samples.wgsl?raw';
import cloudLightArgsSource from '../../gpu/wgsl/clouds/cloud_light_args.wgsl?raw';
import cloudMarchRaySource from '../../gpu/wgsl/clouds/cloud_march_ray.wgsl?raw';
import cloudMarchComposeSource from '../../gpu/wgsl/clouds/cloud_march_compose.wgsl?raw';
import cloudNoiseSource from '../../gpu/wgsl/clouds/cloud_noise.wgsl?raw';
import cloudCoverageSource from '../../gpu/wgsl/clouds/cloud_coverage.wgsl?raw';
import cloudCoveragePagesSource from '../../gpu/wgsl/clouds/cloud_coverage_pages.wgsl?raw';
import cloudCoverageDrawSource from '../../gpu/wgsl/clouds/cloud_coverage_draw.wgsl?raw';
import cloudAmbientSource from '../../gpu/wgsl/clouds/cloud_ambient.wgsl?raw';
import cloudShadowSource from '../../gpu/wgsl/clouds/cloud_shadow.wgsl?raw';
import cloudBayerSource from '../../gpu/wgsl/clouds/cloud_march_bayer.wgsl?raw';
import cloudMarchSource from '../../gpu/wgsl/clouds/cloud_march.wgsl?raw';
import cloudReconstructSource from '../../gpu/wgsl/clouds/cloud_reconstruct.wgsl?raw';
import cloudUpsampleSource from '../../gpu/wgsl/clouds/cloud_upsample.wgsl?raw';
import cloudTilesSource from '../../gpu/wgsl/clouds/cloud_tiles.wgsl?raw';
import cloudShadowArgsSource from '../../gpu/wgsl/clouds/cloud_shadow_args.wgsl?raw';
import cloudScatterArgsSource from '../../gpu/wgsl/clouds/cloud_scatter_args.wgsl?raw';
import cloudSceneLimitSource from '../../gpu/wgsl/clouds/cloud_scene_limit.wgsl?raw';
import cloudPanoramaSource from '../../gpu/wgsl/clouds/cloud_panorama.wgsl?raw';
import cloudCoverSource from '../../gpu/wgsl/clouds/cloud_cover.wgsl?raw';
import cloudTransmissionSource from '../../gpu/wgsl/clouds/cloud_transmission.wgsl?raw';
import cloudVolumeVisibilitySource from '../../gpu/wgsl/clouds/cloud_volume_visibility.wgsl?raw';
import cloudCoverageFieldSource from '../../gpu/wgsl/clouds/cloud_coverage_field.wgsl?raw';
import cloudScatterLookupSource from '../../gpu/wgsl/clouds/cloud_scatter_lookup.wgsl?raw';
import cloudScatterGridSource from '../../gpu/wgsl/clouds/cloud_scatter_grid.wgsl?raw';
import cloudSunSource from '../../gpu/wgsl/clouds/cloud_sun.wgsl?raw';
import cloudScatterSource from '../../gpu/wgsl/clouds/cloud_scatter.wgsl?raw';
import cloudScatterPagesSource from '../../gpu/wgsl/clouds/cloud_scatter_pages.wgsl?raw';
import cloudScatterFilterSource from '../../gpu/wgsl/clouds/cloud_scatter_filter.wgsl?raw';
import cloudPressureDefaultSource from '../../gpu/wgsl/clouds/cloud_pressure_default.wgsl?raw';
import cloudWeatherSource from '../../gpu/wgsl/clouds/cloud_weather.wgsl?raw';
import cloudWeatherGridSource from '../../gpu/wgsl/clouds/cloud_weather_grid.wgsl?raw';
import cloudWeatherMapSource from '../../gpu/wgsl/clouds/cloud_weather_map.wgsl?raw';
import cloudCoverageWeatherSource from '../../gpu/wgsl/clouds/cloud_coverage_weather.wgsl?raw';
import cloudWindWeatherSource from '../../gpu/wgsl/clouds/cloud_wind_weather.wgsl?raw';
import cloudSunVolumeGridSource from '../../gpu/wgsl/clouds/cloud_sun_volume_grid.wgsl?raw';
import cloudSunVolumeLookupSource from '../../gpu/wgsl/clouds/cloud_sun_volume_lookup.wgsl?raw';
import cloudSunVolumeSource from '../../gpu/wgsl/clouds/cloud_sun_volume.wgsl?raw';
import cloudSunRestSource from '../../gpu/wgsl/clouds/cloud_sun_rest.wgsl?raw';
import { nodeNoise } from '../../nodes/shaders';
import { pageAlloc } from '../../gpu/shaders/pageAlloc';

// Módulos das nuvens volumétricas (spec 041): os recursos da `CloudLayer` (resolvers `CloudLayer.*`), os pontos das
// funções de forma (`cloud_shape`) e de cobertura (`cloud_coverage`), a densidade, a fase, a luz e a marcha, os kernels
// dos estágios das nuvens e os módulos das contribuições (`light_transmission`, `sky_cover`).

/** Parâmetros da camada (resolver `CloudLayer.params`). */
export const cloudParamsResource = wgslResource({
    name: 'clouds',
    binding: { uniform: true },
    type: { schema: CloudSchema },
    frequency: 'frame',
    provider: { consumer: 'CloudLayer.params' },
});

const sampled = (
    name: string,
    id: string,
    dimension: '2d' | '2d_array' | '3d' = '2d',
): WgslResource =>
    wgslResource({
        name,
        binding: { texture: { sample: 'f32', dimension } },
        frequency: 'frame',
        provider: { consumer: `CloudLayer.${id}` },
    });

const out = (
    name: string,
    format: GPUTextureFormat,
    dimension: '2d' | '2d_array' | '3d' = '2d',
): WgslResource =>
    wgslResource({
        name,
        binding: { storageTexture: { format, access: 'write', dimension } },
        frequency: 'stage',
        provider: 'private',
    });

/** Slots dos canais temporais da marcha (spec 037): a luz e a transmitância, e a profundidade da nuvem. */
export const cloudHistorySlots = Object.freeze({
    cloudMarch: slot.channel(CloudSchema, 'march'),
    cloudMarchDepth: slot.channel(CloudSchema, 'marchDepth'),
});

/**
 * Slots das séries por páginas do mapa visto do sol (spec 034 T060a; R11 revisto): o atlas (os carimbos e o relógio) e o
 * registro das páginas.
 */
export const cloudShadowSlots = Object.freeze({
    cloudShadow: slot.channel(CloudSchema, 'shadow'),
    cloudShadowPages: slot.channel(CloudSchema, 'shadowPages'),
});

/**
 * Slots das séries por páginas do mapa de cobertura em níveis (spec 034 T060a; R21 rodada 19, T077): o atlas (os carimbos
 * e o relógio) e o registro das páginas.
 */
export const cloudCoverageSlots = Object.freeze({
    cloudCoverage: slot.channel(CloudSchema, 'coverage'),
    cloudCoveragePages: slot.channel(CloudSchema, 'coveragePages'),
});

/** Slots das séries por páginas do cache de espalhamento e do cache filtrado (spec 034 T060a; T023). */
export const cloudScatterSlots = Object.freeze({
    cloudScatter: slot.channel(CloudSchema, 'scatter'),
    cloudScatterFiltered: slot.channel(CloudSchema, 'scatterFiltered'),
    /** O panorama, série de uma página (T074: refeito só quando o que mostra muda). */
    cloudPanorama: slot.channel(CloudSchema, 'panorama'),
});

/**
 * Slots das séries por páginas do volume de τ até o sol perto da câmera (spec 034 T060a; T074): o atlas (os carimbos e o
 * relógio) e o registro das páginas.
 */
export const cloudSunVolumeSlots = Object.freeze({
    cloudSunVolume: slot.channel(CloudSchema, 'sunVolume'),
    cloudSunVolumePages: slot.channel(CloudSchema, 'sunVolumePages'),
});

/** Slot do canal temporal do estado do tempo (spec 037; R19). */
export const cloudWeatherSlots = Object.freeze({
    cloudWeather: slot.channel(CloudSchema, 'weather'),
});

/** Recursos da camada. */
export const cloudResources = Object.freeze({
    params: cloudParamsResource,
    shape: sampled('cloud_shape_tex', 'shape', '3d'),
    detail: sampled('cloud_detail_tex', 'detail', '3d'),
    coverage: sampled('cloud_coverage_tex', 'coverage', '2d_array'),
    ambient: sampled('cloud_ambient_tex', 'ambient'),
    shadow: sampled('cloud_shadow_tex', 'shadow', '3d'),
    panorama: sampled('cloud_panorama_tex', 'panorama'),
    view: sampled('cloud_view_tex', 'view'),
    /** O cache de espalhamento filtrado no espaço (o que a marcha e o panorama leem). */
    scatterFiltered: sampled('cloud_scatter_filtered_tex', 'scatterFiltered', '3d'),
    /** O volume de τ até o sol perto da câmera (T074; o cone e o resto da luz de cada nó, filtrado dentro da página). */
    sunVolume: wgslResource({
        name: 'cloud_sun_volume_tex',
        binding: { texture: { sample: 'f32', dimension: '3d' } },
        frequency: 'frame',
        provider: { consumer: 'CloudLayer.sunVolume' },
    }),
    /** As marcas de validade das páginas do volume no quadro (o trabalho da escolha, só leitura). */
    sunVolumeValid: wgslResource({
        name: 'cloud_sun_volume_valid',
        binding: { storage: 'read' },
        type: { wgsl: 'u32', array: true },
        frequency: 'frame',
        provider: { consumer: 'CloudLayer.sunVolumeWork' },
    }),
    /** O trabalho do quadro do volume (a contagem, a lista das páginas escolhidas e as marcas de validade). */
    sunVolumeWork: wgslResource({
        name: 'cloud_sun_volume_work',
        binding: { storage: 'read_write' },
        type: { wgsl: 'atomic<u32>', array: true },
        frequency: 'frame',
        provider: { consumer: 'CloudLayer.sunVolumeWork' },
    }),
    /** O registro das páginas do volume (a série por páginas, `cloud_sun_volume.wgsl`). */
    sunVolumeRecords: wgslResource({
        name: 'cloud_sun_volume_records',
        binding: { storage: 'read_write' },
        type: { wgsl: 'u32', array: true },
        frequency: 'stage',
        provider: { slot: 'cloudSunVolumePages', lag: 0 },
    }),
    /** Os carimbos das páginas do atlas do volume e o relógio da série. */
    sunVolumeStamps: wgslResource({
        name: 'cloud_sun_volume_stamps',
        binding: { storage: 'read_write' },
        type: { wgsl: 'u32', array: true },
        frequency: 'stage',
        provider: { slot: 'cloudSunVolume', part: 'stamps' },
    }),
    sunVolumeClock: wgslResource({
        name: 'cloud_sun_volume_clock',
        binding: { uniform: true },
        type: { wgsl: 'vec4u' },
        frequency: 'stage',
        provider: { slot: 'cloudSunVolume', part: 'clock' },
    }),
    trace: sampled('cloud_trace', 'trace'),
    traceDepth: sampled('cloud_trace_depth', 'traceDepth'),
    /** O histórico no pixel marchado de cada bloco e a variância temporal dele (T080). */
    check: sampled('cloud_check', 'check'),
    checkNoise: sampled('cloud_check_noise', 'checkNoise'),
    noiseSampler: wgslResource({
        name: 'cloud_noise_sampler',
        binding: { sampler: 'filtering' },
        frequency: 'frame',
        provider: { consumer: 'CloudLayer.noiseSampler' },
    }),
    clampSampler: wgslResource({
        name: 'cloud_clamp_sampler',
        binding: { sampler: 'filtering' },
        frequency: 'frame',
        provider: { consumer: 'CloudLayer.clampSampler' },
    }),
    /** A marcha reconstruída: a do quadro anterior (lida filtrada na reconstrução) e a do quadro (no aumento). */
    marchPrevious: wgslResource({
        name: 'cloud_march_prev',
        binding: { texture: { sample: 'f32' } },
        frequency: 'stage',
        provider: { slot: 'cloudMarch', lag: 1 },
    }),
    marchNow: wgslResource({
        name: 'cloud_march_now',
        binding: { texture: { sample: 'f32' } },
        frequency: 'stage',
        provider: { slot: 'cloudMarch', lag: 0 },
    }),
    marchOut: wgslResource({
        name: 'cloud_march_out',
        binding: { storageTexture: { format: 'rgba16float', access: 'write' } },
        frequency: 'stage',
        provider: { slot: 'cloudMarch', lag: 0 },
    }),
    marchDepthPrevious: wgslResource({
        name: 'cloud_march_depth_prev',
        binding: { texture: { sample: 'f32' } },
        frequency: 'stage',
        provider: { slot: 'cloudMarchDepth', lag: 1 },
    }),
    /** A profundidade da nuvem e a superfície até onde o valor foi marchado, a do quadro (no aumento). */
    marchDepthNow: wgslResource({
        name: 'cloud_march_depth_now',
        binding: { texture: { sample: 'f32' } },
        frequency: 'stage',
        provider: { slot: 'cloudMarchDepth', lag: 0 },
    }),
    marchDepthOut: wgslResource({
        name: 'cloud_march_depth_out',
        binding: { storageTexture: { format: 'rgba32float', access: 'write' } },
        frequency: 'stage',
        provider: { slot: 'cloudMarchDepth', lag: 0 },
    }),
    /** O cache de espalhamento por páginas (série por páginas de buffer: os registros das páginas e as sondas). */
    scatterCache: wgslResource({
        name: 'cloud_scatter_cache',
        binding: { storage: 'read_write' },
        type: { wgsl: 'atomic<u32>', array: true },
        frequency: 'stage',
        provider: { slot: 'cloudScatter', lag: 0 },
    }),
    /** O mesmo cache lido pelo filtro (só leitura, em `vec4f`). */
    scatterCacheRead: wgslResource({
        name: 'cloud_scatter_cache_read',
        binding: { storage: 'read' },
        type: { wgsl: 'vec4f', array: true },
        frequency: 'stage',
        provider: { slot: 'cloudScatter', lag: 0 },
    }),
    scatterStamps: wgslResource({
        name: 'cloud_scatter_stamps',
        binding: { storage: 'read_write' },
        type: { wgsl: 'u32', array: true },
        frequency: 'stage',
        provider: { slot: 'cloudScatter', part: 'stamps' },
    }),
    scatterClock: wgslResource({
        name: 'cloud_scatter_clock',
        binding: { uniform: true },
        type: { wgsl: 'vec4u' },
        frequency: 'stage',
        provider: { slot: 'cloudScatter', part: 'clock' },
    }),
    /** Os carimbos e o relógio da série por páginas do cache filtrado. */
    scatterFilteredStamps: wgslResource({
        name: 'cloud_scatter_filtered_stamps',
        binding: { storage: 'read_write' },
        type: { wgsl: 'u32', array: true },
        frequency: 'stage',
        provider: { slot: 'cloudScatterFiltered', part: 'stamps' },
    }),
    scatterFilteredClock: wgslResource({
        name: 'cloud_scatter_filtered_clock',
        binding: { uniform: true },
        type: { wgsl: 'vec4u' },
        frequency: 'stage',
        provider: { slot: 'cloudScatterFiltered', part: 'clock' },
    }),
    /** Os carimbos e o relógio da série do panorama (uma página; T074). */
    panoramaStamps: wgslResource({
        name: 'cloud_panorama_stamps',
        binding: { storage: 'read_write' },
        type: { wgsl: 'u32', array: true },
        frequency: 'stage',
        provider: { slot: 'cloudPanorama', part: 'stamps' },
    }),
    panoramaClock: wgslResource({
        name: 'cloud_panorama_clock',
        binding: { uniform: true },
        type: { wgsl: 'vec4u' },
        frequency: 'stage',
        provider: { slot: 'cloudPanorama', part: 'clock' },
    }),
    /** O trabalho do quadro do cache (a contagem, o panorama a refazer, a lista das páginas escolhidas e as marcas do filtro). */
    scatterWork: wgslResource({
        name: 'cloud_scatter_work',
        binding: { storage: 'read_write' },
        type: { wgsl: 'atomic<u32>', array: true },
        frequency: 'frame',
        provider: { consumer: 'CloudLayer.scatterWork' },
    }),
    /** Os argumentos dos despachos indiretos dos caminhos e do filtro do cache (T074). */
    scatterArgs: wgslResource({
        name: 'cloud_scatter_args',
        binding: { storage: 'read_write' },
        type: { wgsl: 'u32', array: true },
        frequency: 'frame',
        provider: { consumer: 'CloudLayer.scatterArgs' },
    }),
    /** O estado do tempo (R19): a fatia anterior (lida no lugar trazido pelo vento), a do quadro e a escrita. */
    weatherPrevious: wgslResource({
        name: 'cloud_weather_prev',
        binding: { texture: { sample: 'f32' } },
        frequency: 'stage',
        provider: { slot: 'cloudWeather', lag: 1 },
    }),
    weatherNow: wgslResource({
        name: 'cloud_weather_now',
        binding: { texture: { sample: 'f32' } },
        frequency: 'stage',
        provider: { slot: 'cloudWeather', lag: 0 },
    }),
    weatherOut: wgslResource({
        name: 'cloud_weather_out',
        binding: { storageTexture: { format: 'rgba32float', access: 'write' } },
        frequency: 'stage',
        provider: { slot: 'cloudWeather', lag: 0 },
    }),
    /** O vento das nuvens, a subida e a frente do quadrado do tempo (R19). */
    weatherWind: sampled('cloud_weather_wind_tex', 'weatherWind'),
    /** O registro das páginas do mapa de cobertura em níveis (a série por páginas, `cloud_coverage_draw.wgsl`). */
    coverageRecords: wgslResource({
        name: 'cloud_coverage_records',
        binding: { storage: 'read_write' },
        type: { wgsl: 'u32', array: true },
        frequency: 'stage',
        provider: { slot: 'cloudCoveragePages', lag: 0 },
    }),
    /** Os carimbos das páginas do atlas do mapa de cobertura e o relógio da série. */
    coverageStamps: wgslResource({
        name: 'cloud_coverage_stamps',
        binding: { storage: 'read_write' },
        type: { wgsl: 'u32', array: true },
        frequency: 'stage',
        provider: { slot: 'cloudCoverage', part: 'stamps' },
    }),
    coverageClock: wgslResource({
        name: 'cloud_coverage_clock',
        binding: { uniform: true },
        type: { wgsl: 'vec4u' },
        frequency: 'stage',
        provider: { slot: 'cloudCoverage', part: 'clock' },
    }),
    /** A lista das páginas do quadro do mapa de cobertura (a contagem e as páginas físicas). */
    coverageWork: wgslResource({
        name: 'cloud_coverage_work',
        binding: { storage: 'read_write' },
        type: { wgsl: 'atomic<u32>', array: true },
        frequency: 'frame',
        provider: { consumer: 'CloudLayer.coverageWork' },
    }),
    /** O registro das páginas do mapa visto do sol (a série por páginas, `cloud_shadow.wgsl`). */
    shadowPages: wgslResource({
        name: 'cloud_shadow_pages_meta',
        binding: { storage: 'read_write' },
        type: { schema: CloudShadowPageSchema, array: true },
        frequency: 'stage',
        provider: { slot: 'cloudShadowPages', lag: 0 },
    }),
    /** Os carimbos das páginas do atlas (a época em que cada uma foi escrita) e o relógio da série (`vec4u`: a época). */
    shadowStamps: wgslResource({
        name: 'cloud_shadow_stamps',
        binding: { storage: 'read_write' },
        type: { wgsl: 'u32', array: true },
        frequency: 'stage',
        provider: { slot: 'cloudShadow', part: 'stamps' },
    }),
    shadowClock: wgslResource({
        name: 'cloud_shadow_clock',
        binding: { uniform: true },
        type: { wgsl: 'vec4u' },
        frequency: 'stage',
        provider: { slot: 'cloudShadow', part: 'clock' },
    }),
    /** O registro das páginas do mapa visto do sol, lido pelos consumidores (o sol do desenho de cada página). */
    shadowRecords: wgslResource({
        name: 'cloud_shadow_records',
        binding: { storage: 'read' },
        type: { schema: CloudShadowPageViewSchema, array: true },
        frequency: 'frame',
        provider: { consumer: 'CloudLayer.shadowPages' },
    }),
    /** As marcas das páginas do quadro (a contagem e uma palavra por página física). */
    shadowWork: wgslResource({
        name: 'cloud_shadow_work',
        binding: { storage: 'read_write' },
        type: { wgsl: 'atomic<u32>', array: true },
        frequency: 'frame',
        provider: { consumer: 'CloudLayer.shadowWork' },
    }),
    /** Os argumentos do despacho indireto do desenho do mapa visto do sol (T074). */
    shadowArgs: wgslResource({
        name: 'cloud_shadow_args',
        binding: { storage: 'read_write' },
        type: { wgsl: 'u32', array: true },
        frequency: 'frame',
        provider: { consumer: 'CloudLayer.shadowArgs' },
    }),
    /** A profundidade da cena (sem e com amostras), privada do estágio da marcha. */
    sceneDepth: wgslResource({
        name: 'cloud_scene_depth_tex',
        binding: { texture: { sample: 'depth' } },
        frequency: 'stage',
        provider: 'private',
    }),
    sceneDepthMs: wgslResource({
        name: 'cloud_scene_depth_tex',
        binding: { texture: { sample: 'depth', multisampled: true } },
        frequency: 'stage',
        provider: 'private',
    }),
});

const R = cloudResources;

/** Saídas dos kernels (texturas da `CloudLayer`), privadas dos estágios das nuvens. */
export const cloudOutputs = Object.freeze({
    shape: out('cloud_shape_out', 'rgba8unorm', '3d'),
    detail: out('cloud_detail_out', 'rgba8unorm', '3d'),
    coverage: out('cloud_coverage_out', 'rgba8unorm', '2d_array'),
    ambient: out('cloud_ambient_out', 'rgba16float'),
    shadow: out('cloud_shadow_out', 'rgba16float', '3d'),
    trace: out('cloud_trace_out', 'rgba16float'),
    traceDepth: out('cloud_trace_depth_out', 'rgba32float'),
    check: out('cloud_check_out', 'rgba16float'),
    checkNoise: out('cloud_check_noise_out', 'rg32float'),
    view: out('cloud_view_out', 'rgba16float'),
    panorama: out('cloud_panorama_out', 'rgba16float'),
    weatherWind: out('cloud_weather_wind_out', 'rgba16float'),
    /**
     * O cache filtrado, escrito pelo consumidor da camada (não pela ligação privada do estágio): o grupo do filtro
     * também lê a série do cache, e a C2 o refaz quando a série muda (a camada que sai, o perfil que redimensiona) —
     * com a saída resolvida pela camada, a vista é a do descritor de agora.
     */
    /** O atlas do volume de τ até o sol, escrito pelo consumidor da camada (a série por páginas; T074). */
    sunVolume: wgslResource({
        name: 'cloud_sun_volume_out',
        binding: { storageTexture: { format: 'rgba16float', access: 'write', dimension: '3d' } },
        frequency: 'frame',
        provider: { consumer: 'CloudLayer.sunVolume' },
    }),
    scatterFiltered: wgslResource({
        name: 'cloud_scatter_filtered_out',
        binding: { storageTexture: { format: 'rgba16float', access: 'write', dimension: '3d' } },
        frequency: 'frame',
        provider: { consumer: 'CloudLayer.scatterFiltered' },
    }),
});

// ── Pontos das funções ──────────────────────────────────────────────────────────────────────────────────────────────

/** Função pronta do ponto `cloud_shape`: o meio homogêneo (todos os canais 1). */
const shapeFnReady = wgslModule({
    name: 'cloud_shape_fn_ready',
    source: `struct ShapeFnParams {
    _unused: u32,
}

fn shape_fn_params(slot: u32) -> ShapeFnParams {
    return ShapeFnParams(0u);
}

fn shape_fn(p: vec3f, data: ShapeFnParams) -> vec4f {
    return vec4f(1.0);
}`,
});

/** Função pronta do ponto `cloud_coverage`: cobertura e tipo da camada, densidade relativa 1. */
const coverageFnReady = wgslModule({
    name: 'cloud_coverage_fn_ready',
    requires: [cloudParamsResource],
    source: `struct CoverageFnParams {
    _unused: u32,
}

fn coverage_fn_params(slot: u32) -> CoverageFnParams {
    return CoverageFnParams(0u);
}

fn coverage_fn(xz: vec2f, time: f32, data: CoverageFnParams) -> vec3f {
    return vec3f(clouds.layer.x, clouds.layer.y, 1.0);
}`,
});

/** O campo de pressão padrão (R19): o padrão de sistemas de alta e baixa, pelos valores do tempo da camada. */
const pressureDefault = wgslModule({
    name: 'cloud_pressure_default',
    source: cloudPressureDefaultSource,
    requires: [constants, cloudParamsResource, random],
});

/** Função pronta do ponto `cloud_pressure`: o padrão de sistemas da biblioteca. */
const pressureFnReady = wgslModule({
    name: 'cloud_pressure_fn_ready',
    requires: [pressureDefault],
    source: `struct PressureFnParams {
    _unused: u32,
}

fn pressure_fn_params(slot: u32) -> PressureFnParams {
    return PressureFnParams(0u);
}

fn pressure_fn(xz: vec2f, time: f32, data: PressureFnParams) -> f32 {
    return cloud_pressure_default(xz, time);
}`,
});

const checkOut = (name: string): WgslResource =>
    wgslResource({
        name,
        binding: { storage: 'read_write' },
        type: { wgsl: 'vec4f', array: true },
        frequency: 'draw',
        provider: 'private',
    });

/** Kernels de validação das funções (não são despachados). */
const shapeCheck = wgslModule({
    name: 'cloud_shape_check',
    requires: [shapeFnReady, checkOut('cloud_shape_check_out')],
    source: `@compute @workgroup_size(1)
fn cloud_shape_check_main() {
    cloud_shape_check_out[1] = shape_fn(cloud_shape_check_out[0].xyz, shape_fn_params(0u));
}`,
});

const coverageCheck = wgslModule({
    name: 'cloud_coverage_check',
    requires: [coverageFnReady, checkOut('cloud_coverage_check_out')],
    source: `@compute @workgroup_size(1)
fn cloud_coverage_check_main() {
    let i = cloud_coverage_check_out[0];
    cloud_coverage_check_out[1] = vec4f(coverage_fn(i.xy, i.z, coverage_fn_params(0u)), 0.0);
}`,
});

const pressureCheck = wgslModule({
    name: 'cloud_pressure_check',
    requires: [pressureFnReady, checkOut('cloud_pressure_check_out')],
    source: `@compute @workgroup_size(1)
fn cloud_pressure_check_main() {
    let i = cloud_pressure_check_out[0];
    cloud_pressure_check_out[1] = vec4f(pressure_fn(i.xy, i.z, pressure_fn_params(0u)), 0.0, 0.0, 0.0);
}`,
});

/**
 * Ponto `cloud_shape` (spec 041, R3): `fn shape_fn(p: vec3f, data: ShapeFnParams) -> vec4f` — os quatro canais do volume
 * de ruído em `p` ∈ [0, 1)³ (periódico): R a forma base, G/B/A a erosão em três frequências.
 */
export const cloudShapePoint = wgslPoint({
    name: 'cloud_shape',
    required: {
        name: 'shape_fn',
        params: ['vec3f', POINT_PARAMS],
        returns: 'vec4f',
        names: ['p', 'data'],
    },
    paramsAlias: 'ShapeFnParams',
    ready: shapeFnReady,
    hosts: () => [shapeCheck],
});

/**
 * Ponto `cloud_coverage` (spec 041, R4): `fn coverage_fn(xz: vec2f, time: f32, data: CoverageFnParams) -> vec3f` —
 * cobertura, tipo e densidade relativa no ponto horizontal (m, no referencial que anda com o vento) no tempo simulado.
 */
export const cloudCoveragePoint = wgslPoint({
    name: 'cloud_coverage',
    required: {
        name: 'coverage_fn',
        params: ['vec2f', 'f32', POINT_PARAMS],
        returns: 'vec3f',
        names: ['xz', 'time', 'data'],
    },
    paramsAlias: 'CoverageFnParams',
    ready: coverageFnReady,
    hosts: () => [coverageCheck],
});

/**
 * Ponto `cloud_pressure` (spec 041, R19): `fn pressure_fn(xz: vec2f, time: f32, data: PressureFnParams) -> f32` — a
 * anomalia de pressão (Pa) no ponto horizontal (m, no referencial que anda com o vento de condução) no tempo simulado.
 */
export const cloudPressurePoint = wgslPoint({
    name: 'cloud_pressure',
    required: {
        name: 'pressure_fn',
        params: ['vec2f', 'f32', POINT_PARAMS],
        returns: 'f32',
        names: ['xz', 'time', 'data'],
    },
    paramsAlias: 'PressureFnParams',
    ready: pressureFnReady,
    hosts: () => [pressureCheck],
});

/** `cloud_shape_at` pronto (sem função de forma): o meio homogêneo. */
const shapeAtReady = wgslModule({
    name: 'cloud_shape_at_ready',
    source: 'fn cloud_shape_at(p: vec3f, slot: u32) -> vec4f {\n    return vec4f(1.0);\n}',
});

/** O campo da cobertura global (a área coberta é a cobertura pedida). */
const coverageField = wgslModule({
    name: 'cloud_coverage_field',
    source: cloudCoverageFieldSource,
    requires: [nodeNoise],
});

/** `cloud_coverage_fn_at` pronto (sem função de cobertura): os campos da cobertura e do tipo em volta dos da camada. */
const coverageAtReady = wgslModule({
    name: 'cloud_coverage_fn_at_ready',
    requires: [cloudParamsResource, coverageField],
    source: 'fn cloud_coverage_fn_at(xz: vec2f, time: f32, slot: u32) -> vec3f {\n    return vec3f(cloud_coverage_field(xz, clouds.layer.x, clouds.layer.y), cloud_type_field(xz, clouds.layer.y), 1.0);\n}',
});

/** `cloud_pressure_fn_at` pronto (sem função de pressão): o padrão de sistemas. */
const pressureAtReady = wgslModule({
    name: 'cloud_pressure_fn_at_ready',
    requires: [pressureDefault],
    source: 'fn cloud_pressure_fn_at(xz: vec2f, time: f32, slot: u32) -> f32 {\n    return cloud_pressure_default(xz, time);\n}',
});

/** `cloud_wind_at` pronto (sem o tempo): o vento uniforme da camada. */
const windAtReady = wgslModule({
    name: 'cloud_wind_at_ready',
    requires: [cloudParamsResource],
    source: 'fn cloud_wind_at(p: vec3f) -> vec2f {\n    return clouds.wind.zw;\n}',
});

/** Lugar da função de forma no kernel dos volumes (o estágio troca o pronto pela composta, `bindPoints`). */
export const cloudShapeAtPoint: BindablePoint = { name: 'cloud_shape_at', ready: shapeAtReady };
/** Lugar da função de cobertura no kernel do mapa. */
export const cloudCoverageAtPoint: BindablePoint = {
    name: 'cloud_coverage_fn_at',
    ready: coverageAtReady,
};

/** Lugar da função de pressão no kernel do tempo. */
export const cloudPressureAtPoint: BindablePoint = {
    name: 'cloud_pressure_fn_at',
    ready: pressureAtReady,
};
/** Lugar do vento das nuvens na reconstrução temporal (o uniforme; com o tempo, o do quadrado do tempo). */
export const cloudWindAtPoint: BindablePoint = { name: 'cloud_wind_at', ready: windAtReady };

/** O módulo que chama a função composta `functionName` com o carregador `loaderName` no lugar do pronto. */
export function cloudShapeAt(fn: {
    module: WgslModule;
    functionName: string;
    loaderName: string;
}): WgslModule {
    return wgslModule({
        name: `cloud_shape_at_${fn.module.name}`,
        requires: [fn.module],
        source: `fn cloud_shape_at(p: vec3f, slot: u32) -> vec4f {\n    return ${fn.functionName}(p, ${fn.loaderName}(slot));\n}`,
    });
}

/** Idem para a cobertura. */
export function cloudCoverageAt(fn: {
    module: WgslModule;
    functionName: string;
    loaderName: string;
}): WgslModule {
    return wgslModule({
        name: `cloud_coverage_fn_at_${fn.module.name}`,
        requires: [fn.module],
        source: `fn cloud_coverage_fn_at(xz: vec2f, time: f32, slot: u32) -> vec3f {\n    return ${fn.functionName}(xz, time, ${fn.loaderName}(slot));\n}`,
    });
}

/** Idem para a pressão. */
export function cloudPressureAt(fn: {
    module: WgslModule;
    functionName: string;
    loaderName: string;
}): WgslModule {
    return wgslModule({
        name: `cloud_pressure_fn_at_${fn.module.name}`,
        requires: [fn.module],
        source: `fn cloud_pressure_fn_at(xz: vec2f, time: f32, slot: u32) -> f32 {\n    return ${fn.functionName}(xz, time, ${fn.loaderName}(slot));\n}`,
    });
}

// ── Módulos comuns ──────────────────────────────────────────────────────────────────────────────────────────────────

/** A casca, a altitude, o perfil de altura. */
export const cloudCommon = wgslModule({
    name: 'cloud_common',
    source: cloudCommonSource,
    requires: [cloudParamsResource],
});

/** A fase de Jendersie & d'Eon. */
export const cloudPhase = wgslModule({
    name: 'cloud_phase',
    source: cloudPhaseSource,
    requires: [constants, cloudParamsResource],
});

/** O endereçamento do mapa de cobertura em níveis (os níveis, a janela, o atlas; R21 rodada 19). */
export const cloudCoveragePages = wgslModule({
    name: 'cloud_coverage_pages',
    source: cloudCoveragePagesSource,
    requires: [cloudParamsResource],
});

/** A densidade (cobertura, perfil, forma, erosão). */
export const cloudDensity = wgslModule({
    name: 'cloud_density',
    source: cloudDensitySource,
    requires: [
        coverageField,
        cloudCoveragePages,
        cloudCommon,
        cloudParamsResource,
        R.shape,
        R.detail,
        R.coverage,
        R.noiseSampler,
        R.clampSampler,
    ],
});

/** Invocações do grupo do desenho de uma página do mapa visto do sol (um grupo por página física). */
export const CLOUD_SHADOW_PAGE_GROUP = sharedConstant('CLOUD_SHADOW_PAGE_GROUP', 256, 'u32');
/**
 * Grupos do desenho do mapa visto do sol por página (T074): os argumentos do despacho indireto (`cloud_shadow_args`) e o
 * desenho (`cloud_shadow_draw_main`) o compartilham.
 */
export const CLOUD_SHADOW_DRAW_ROWS = sharedConstant('CLOUD_SHADOW_DRAW_ROWS', 5, 'u32');

/** O endereçamento do mapa visto do sol por páginas (os níveis, a janela, o atlas). */
export const cloudShadowPages = wgslModule({
    name: 'cloud_shadow_pages',
    source: cloudShadowPagesSource,
    requires: [cloudParamsResource],
});

/** A transmitância até o sol pelo mapa visto do sol. */
export const cloudShadowLookup = wgslModule({
    name: 'cloud_shadow_lookup',
    source: cloudShadowLookupSource,
    requires: [
        cloudCommon,
        cloudShadowPages,
        cloudParamsResource,
        R.shadow,
        R.clampSampler,
        R.shadowRecords,
    ],
});

/** A luz do sol que chega a um ponto da camada (a atmosfera até ele). */
export const cloudSun = wgslModule({
    name: 'cloud_sun',
    source: cloudSunSource,
    requires: [cloudCommon, sky, cloudParamsResource],
});

/** A grade do cache de espalhamento (T023). */
export const cloudScatterGrid = wgslModule({
    name: 'cloud_scatter_grid',
    source: cloudScatterGridSource,
    requires: [cloudCommon, cloudParamsResource, camerasResource, xformRigid],
});

/** As páginas do cache de espalhamento (T023; R11 revisto). */
export const cloudScatterPages = wgslModule({
    name: 'cloud_scatter_pages',
    source: cloudScatterPagesSource,
    requires: [cloudParamsResource, R.scatterCache, R.scatterStamps, R.scatterClock],
});

/** A leitura do cache de espalhamento filtrado (T023). */
export const cloudScatterLookup = wgslModule({
    name: 'cloud_scatter_lookup',
    source: cloudScatterLookupSource,
    requires: [
        cloudScatterGrid,
        sky,
        cloudParamsResource,
        R.scatterFiltered,
        R.clampSampler,
        R.ambient,
    ],
});

/** A grade do volume de τ até o sol perto da câmera (T074). */
export const cloudSunVolumeGrid = wgslModule({
    name: 'cloud_sun_volume_grid',
    source: cloudSunVolumeGridSource,
    requires: [cloudCommon, cloudParamsResource],
});

/** A leitura do volume de τ até o sol (T074). */
export const cloudSunVolumeLookup = wgslModule({
    name: 'cloud_sun_volume_lookup',
    source: cloudSunVolumeLookupSource,
    requires: [
        cloudSunVolumeGrid,
        cloudCommon,
        cloudParamsResource,
        R.sunVolume,
        R.sunVolumeValid,
        R.clampSampler,
    ],
});

/** O resto da profundidade ótica até o sol depois do cone (o pedaço até o meio nó e o nó do mapa visto do sol). */
export const cloudSunRest = wgslModule({
    name: 'cloud_sun_rest',
    source: cloudSunRestSource,
    requires: [cloudDensity, cloudShadowLookup, sky, cloudParamsResource],
});

/** A luz e a marcha (teto constante de passos). */
export const cloudLight = wgslModule({
    name: 'cloud_light',
    source: cloudLightSource,
    requires: [
        cloudCommon,
        cloudDensity,
        cloudPhase,
        cloudShadowLookup,
        cloudScatterLookup,
        cloudSunRest,
        cloudSunVolumeLookup,
        cloudSun,
        sky,
        cloudParamsResource,
        R.ambient,
    ],
});

/**
 * Pronto do ponto `cloud_sample_light`: a luz da amostra calculada no próprio laço da marcha (o panorama). A marcha da
 * tela a adia para o passe da luz (`cloudLightList`, T074).
 */
const sampleLightReady = wgslModule({
    name: 'cloud_sample_light_ready',
    requires: [cloudLight],
    source: `fn cloud_sample_light(p: vec3f, cos_theta: f32, light_steps: u32, occ: f32, weight: f32) -> vec3f {
    return weight * cloud_radiance(p, cos_theta, light_steps, occ);
}`,
});

/** O ponto da luz de uma amostra da marcha com o peso dela na soma do raio. */
export const cloudSampleLightPoint: BindablePoint = {
    name: 'cloud_sample_light',
    ready: sampleLightReady,
};

/** A marcha por um raio (`cloud_integrate`), com a luz de cada amostra pelo ponto `cloud_sample_light`. */
export const cloudIntegrate = wgslModule({
    name: 'cloud_integrate',
    source: cloudIntegrateSource,
    requires: [
        cloudCommon,
        cloudDensity,
        cloudLight,
        sampleLightReady,
        cloudSunVolumeLookup,
        sky,
        cloudParamsResource,
    ],
});

/** O teto de amostras da lista da luz da marcha: o índice é guardado em f32 (exato até 2²⁴). */
export const CLOUD_LIGHT_LIST_MAX = sharedConstant('CLOUD_LIGHT_LIST_MAX', 16_777_216, 'u32');

const stagePrivate = (
    name: string,
    binding: Parameters<typeof wgslResource>[0]['binding'],
    type?: Parameters<typeof wgslResource>[0]['type'],
): WgslResource =>
    wgslResource({
        name,
        binding,
        ...(type === undefined ? {} : { type }),
        frequency: 'stage',
        provider: 'private',
    });

/**
 * A lista da luz das amostras da marcha da tela (T074; privada do estágio da marcha): o que a marcha grava de cada
 * amostra (`a`: o ponto e o peso; `b`: a pegada, a coluna do ambiente, o cosseno com o sol e a amostra anterior do
 * raio), a luz que o passe da luz grava (`light`), o raio marchado (a luz das amostras fora da lista e a transmitância)
 * e as palavras do despacho indireto do passe da luz (os grupos, a contagem atômica e a contagem do quadro).
 */
export const cloudLightList = Object.freeze({
    aOut: stagePrivate('cloud_light_list_a_out', {
        storageTexture: { format: 'rgba32float', access: 'write' },
    }),
    bOut: stagePrivate('cloud_light_list_b_out', {
        storageTexture: { format: 'rgba32float', access: 'write' },
    }),
    a: stagePrivate('cloud_light_list_a', { texture: { sample: 'f32' } }),
    b: stagePrivate('cloud_light_list_b', { texture: { sample: 'f32' } }),
    lightOut: stagePrivate('cloud_light_list_out', {
        storageTexture: { format: 'rgba32float', access: 'write' },
    }),
    light: stagePrivate('cloud_light_list', { texture: { sample: 'f32' } }),
    rayOut: stagePrivate('cloud_ray_out', {
        storageTexture: { format: 'rgba32float', access: 'write' },
    }),
    ray: stagePrivate('cloud_ray', { texture: { sample: 'f32' } }),
    args: stagePrivate(
        'cloud_light_args',
        { storage: 'read_write' },
        { wgsl: 'atomic<u32>', array: true },
    ),
    argsRead: stagePrivate(
        'cloud_light_args_read',
        { storage: 'read' },
        { wgsl: 'u32', array: true },
    ),
});

/** A implementação do ponto `cloud_sample_light` na marcha da tela: a amostra na lista do quadro. */
const cloudLightListModule = wgslModule({
    name: 'cloud_light_list',
    source: cloudLightListSource,
    requires: [
        CLOUD_LIGHT_LIST_MAX.module,
        cloudLight,
        cloudSunVolumeLookup,
        cloudLightList.aOut,
        cloudLightList.bOut,
        cloudLightList.args,
    ],
});

const bayer = wgslModule({
    name: 'cloud_march_bayer',
    source: cloudBayerSource,
    requires: [cloudParamsResource],
});

/** A profundidade da cena no kernel (sem e com amostras): `cloud_scene_depth(px)` e o tamanho. */
const sceneDepth = {
    single: wgslModule({
        name: 'cloud_scene_depth',
        requires: [R.sceneDepth],
        source: `fn cloud_scene_depth(px: vec2i) -> f32 {
    return textureLoad(cloud_scene_depth_tex, px, 0);
}

fn cloud_scene_depth_size() -> vec2u {
    return textureDimensions(cloud_scene_depth_tex);
}`,
    }),
    multisampled: wgslModule({
        name: 'cloud_scene_depth',
        requires: [R.sceneDepthMs],
        source: `fn cloud_scene_depth(px: vec2i) -> f32 {
    return textureLoad(cloud_scene_depth_tex, px, 0);
}

fn cloud_scene_depth_size() -> vec2u {
    return textureDimensions(cloud_scene_depth_tex);
}`,
    }),
} as const;

/**
 * A superfície por trás das nuvens: a distância de um pixel da tela e a menor de um texel do alvo reconstruído (lê
 * `cloud_scene_depth`, sem e com amostras, que o kernel traz).
 */
const sceneLimit = wgslModule({
    name: 'cloud_scene_limit',
    source: cloudSceneLimitSource,
    requires: [bayer, viewSpace, cameraSpace, camerasResource],
});

/** O tempo (R19): o estêncil da pressão, o vento equilibrado, Ekman, a frente e o mapeamento para as nuvens. */
export const cloudWeather = wgslModule({
    name: 'cloud_weather',
    source: cloudWeatherSource,
    requires: [cloudParamsResource, pressureAtReady],
});

/** O quadrado do tempo centrado na câmera (R19). */
export const cloudWeatherGrid = wgslModule({
    name: 'cloud_weather_grid',
    source: cloudWeatherGridSource,
    requires: [cloudParamsResource, camerasResource, xformRigid],
});

/** O vento das nuvens pelo quadrado do tempo (R19), no lugar `cloud_wind_at`. */
export const cloudWindWeather = wgslModule({
    name: 'cloud_wind_weather',
    source: cloudWindWeatherSource,
    requires: [cloudParamsResource, cloudCommon, cloudWeatherGrid, R.weatherWind, R.clampSampler],
});

// ── Kernels ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Volumes de ruído pela função de forma (lugar `cloud_shape_at`). */
export const cloudNoiseKernel = wgslModule({
    name: 'cloud_noise',
    source: cloudNoiseSource,
    requires: [
        WORKGROUP_SIZE.module,
        cloudParamsResource,
        shapeAtReady,
        cloudOutputs.shape,
        cloudOutputs.detail,
    ],
});

/** Invocações do grupo do desenho de uma página do mapa de cobertura (e da escolha do quadro). */
export const CLOUD_COVERAGE_PAGE_GROUP = sharedConstant('CLOUD_COVERAGE_PAGE_GROUP', 256, 'u32');

/** A escolha e o desenho das páginas do mapa de cobertura em níveis (R21 rodada 19), pelo `cloud_coverage_value` do kernel. */
const cloudCoverageDraw = wgslModule({
    name: 'cloud_coverage_draw',
    source: cloudCoverageDrawSource,
    requires: [
        CLOUD_COVERAGE_PAGE_GROUP.module,
        cloudParamsResource,
        cloudCoveragePages,
        pageAlloc,
        cloudOutputs.coverage,
        R.coverageRecords,
        R.coverageStamps,
        R.coverageClock,
        R.coverageWork,
    ],
});

/** Mapa de cobertura pela função de cobertura (lugar `cloud_coverage_fn_at`). */
export const cloudCoverageKernel = wgslModule({
    name: 'cloud_coverage',
    source: cloudCoverageSource,
    requires: [cloudParamsResource, coverageAtReady, cloudCoverageDraw],
});

/** O estado do tempo (série 037) e o vento das nuvens pela função de pressão (lugar `cloud_pressure_fn_at`; R19). */
export const cloudWeatherKernel = wgslModule({
    name: 'cloud_weather_map',
    source: cloudWeatherMapSource,
    requires: [
        WORKGROUP_SIZE.module,
        cloudParamsResource,
        camerasResource,
        cloudWeather,
        cloudWeatherGrid,
        R.weatherPrevious,
        R.weatherOut,
        cloudOutputs.weatherWind,
    ],
});

/** Mapa de cobertura pelo estado do tempo (R19). */
export const cloudCoverageWeatherKernel = wgslModule({
    name: 'cloud_coverage_weather_kernel',
    requires: [
        wgslModule({
            name: 'cloud_coverage_weather',
            source: cloudCoverageWeatherSource,
            requires: [
                cloudParamsResource,
                camerasResource,
                coverageField,
                cloudWeatherGrid,
                R.weatherNow,
            ],
        }),
        cloudCoverageDraw,
    ],
    source: 'fn cloud_coverage_value(w: vec2f) -> vec4f {\n    return cloud_coverage_weather_value(w);\n}',
});

/** Irradiâncias do céu e do chão. */
export const cloudAmbientKernel = wgslModule({
    name: 'cloud_ambient',
    source: cloudAmbientSource,
    requires: [WORKGROUP_SIZE.module, constants, sky, skyParamsResource, cloudOutputs.ambient],
});

/**
 * O mapa de transmitância visto do sol por páginas: a escolha do quadro (`cloud_shadow_select_main`, o vento local no
 * lugar `cloud_wind_at`) e o desenho das escolhidas com as provas das demais (`cloud_shadow_main`).
 */
const cloudShadowBase = wgslModule({
    name: 'cloud_shadow',
    source: cloudShadowSource,
    requires: [
        WORKGROUP_SIZE.module,
        CLOUD_SHADOW_PAGE_GROUP.module,
        CLOUD_SHADOW_DRAW_ROWS.module,
        cloudCommon,
        cloudDensity,
        cloudShadowPages,
        cloudParamsResource,
        camerasResource,
        pageAlloc,
        windAtReady,
        cloudOutputs.shadow,
        R.shadowPages,
        R.shadowStamps,
        R.shadowClock,
        R.shadowWork,
    ],
});

/** Os argumentos do despacho indireto do desenho do mapa visto do sol pela contagem da escolha (T074). */
export const cloudShadowArgsKernel = wgslModule({
    name: 'cloud_shadow_args_kernel',
    source: cloudShadowArgsSource,
    requires: [CLOUD_SHADOW_DRAW_ROWS.module, R.shadowWork, R.shadowArgs],
});

/** O mapa visto do sol sem o tempo e com ele (o vento local das nuvens pelo quadrado do tempo). */
export const cloudShadowKernel = {
    plain: cloudShadowBase,
    weather: bindPoints(cloudShadowBase, new Map([[cloudWindAtPoint, cloudWindWeather]])),
} as const;

/**
 * A visibilidade do sol no ar além da tabela aérea pelo mapa visto do sol (R19): o ponto a `t_km` da câmera na direção
 * `dir` (a posição da câmera do quadro, `clouds.eye`) — as nuvens além de 32 km com o ar na frente sombreado como até
 * 32 km (a tabela). A transmitância `e^(−τ)` de cada um dos quatro texels vizinhos, e a bilinear delas (não de τ): a
 * 50–100 km o texel do mapa tem quilômetros, e a média de τ numa borda de sombra (0 de um lado, dezenas do outro) dava
 * a transmitância de quase 0 onde metade do texel tem sol (`far-cloud`: 7 % abaixo da referência). Lugar
 * `sky_aerial_far_visibility` da marcha e do panorama; os dois níveis da mistura do mapa por páginas; teto: 16 leituras.
 */
const cloudAerialFarVisibility = wgslModule({
    name: 'cloud_aerial_far_visibility',
    requires: [cloudParamsResource, cloudShadowPages, cloudShadowLookup],
    source: `fn sky_aerial_far_visibility(dir: vec3f, t_km: f32) -> f32 {
    let c = cloud_shadow_column(clouds.eye.xyz + dir * (t_km * 1000.0));
    if (c.len <= 0.0) { return 1.0; }
    let k = min(u32(floor(c.knot)), 15u);
    return cloud_shadow_transmittance_column(c, k, c.knot - f32(k));
}`,
});

/** A marcha e o panorama com a sombra das nuvens no ar além da tabela. */
const withFarShadow = (m: WgslModule): WgslModule =>
    bindPoints(m, new Map([[skyAerialFarVisibilityPoint, cloudAerialFarVisibility]]));

/** Marcha principal (sem e com amostras na profundidade da cena), antes da sombra no ar além da tabela. */
const marchRay = {
    single: wgslModule({
        name: 'cloud_march_ray',
        source: cloudMarchRaySource,
        requires: [
            bayer,
            sceneDepth.single,
            cameraSpace,
            random,
            cloudParamsResource,
            camerasResource,
        ],
    }),
    multisampled: wgslModule({
        name: 'cloud_march_ray_ms',
        source: cloudMarchRaySource,
        requires: [
            bayer,
            sceneDepth.multisampled,
            cameraSpace,
            random,
            cloudParamsResource,
            camerasResource,
        ],
    }),
} as const;

const marchModule = (ms: boolean): WgslModule =>
    bindPoints(
        wgslModule({
            name: ms ? 'cloud_march_ms' : 'cloud_march',
            source: cloudMarchSource,
            requires: [
                WORKGROUP_SIZE.module,
                ms ? marchRay.multisampled : marchRay.single,
                cloudIntegrate,
                sceneLimit,
                ms ? sceneDepth.multisampled : sceneDepth.single,
                viewSpace,
                cameraSpace,
                random,
                cloudParamsResource,
                camerasResource,
                cloudLightList.rayOut,
                cloudOutputs.traceDepth,
            ],
        }),
        new Map([[cloudSampleLightPoint, cloudLightListModule]]),
    );

/** A marcha da tela: a luz das amostras adiada para o passe da luz (`cloudLightSamplesKernel`). */
export const cloudMarchKernel = {
    single: marchModule(false),
    multisampled: marchModule(true),
} as const;

/** O passe da luz das amostras da marcha da tela (T074): uma amostra da lista por invocação. */
export const cloudLightSamplesKernel = wgslModule({
    name: 'cloud_light_samples',
    source: cloudLightSamplesSource,
    requires: [
        WORKGROUP_SIZE.module,
        cloudLight,
        cloudSunVolumeLookup,
        cloudParamsResource,
        cloudLightList.a,
        cloudLightList.b,
        cloudLightList.lightOut,
        cloudLightList.argsRead,
    ],
});

/** Os argumentos do despacho indireto do passe da luz. */
export const cloudLightArgsKernel = wgslModule({
    name: 'cloud_light_args_kernel',
    source: cloudLightArgsSource,
    requires: [
        WORKGROUP_SIZE.module,
        CLOUD_LIGHT_LIST_MAX.module,
        cloudLightList.a,
        cloudLightList.args,
    ],
});

const composeModule = (ms: boolean): WgslModule =>
    withFarShadow(
        wgslModule({
            name: ms ? 'cloud_march_compose_ms' : 'cloud_march_compose',
            source: cloudMarchComposeSource,
            requires: [
                WORKGROUP_SIZE.module,
                cloudCommon,
                ms ? marchRay.multisampled : marchRay.single,
                skyAerialLookup,
                sceneNearFogReady,
                sky,
                cloudParamsResource,
                cloudLightList.ray,
                R.traceDepth,
                cloudLightList.light,
                cloudOutputs.trace,
            ],
        }),
    );

/** A composição da marcha: a soma da luz das amostras de cada raio e o que está na frente da nuvem. */
export const cloudMarchComposeKernel = {
    single: composeModule(false),
    multisampled: composeModule(true),
} as const;

const reconstructRequires = [
    WORKGROUP_SIZE.module,
    color,
    cloudCommon,
    bayer,
    sceneLimit,
    viewSpace,
    cameraSpace,
    cloudParamsResource,
    camerasResource,
    R.trace,
    R.traceDepth,
    R.marchPrevious,
    R.marchDepthPrevious,
    R.marchOut,
    R.marchDepthOut,
    R.check,
    R.checkNoise,
    cloudOutputs.check,
    cloudOutputs.checkNoise,
    windAtReady,
];
export const cloudReconstructKernel = {
    single: wgslModule({
        name: 'cloud_reconstruct',
        source: cloudReconstructSource,
        requires: [...reconstructRequires, sceneDepth.single],
    }),
    multisampled: wgslModule({
        name: 'cloud_reconstruct_ms',
        source: cloudReconstructSource,
        requires: [...reconstructRequires, sceneDepth.multisampled],
    }),
} as const;

/** O lado do bloco da tela da lista da composição das nuvens (pixels; T074): um grupo de `CLOUD_TILE`² invocações. */
export const CLOUD_TILE = sharedConstant('CLOUD_TILE', 8, 'u32');

/**
 * A lista dos blocos da tela com nuvem (T074), privada dos estágios que a escrevem (o aumento, a lista) e a leem (a
 * composição): as marcas por bloco, a lista empacotada e as palavras do despacho indireto (0–2 os grupos, 3 a contagem).
 */
export const cloudTiles = Object.freeze({
    marksOut: wgslResource({
        name: 'cloud_tiles_out',
        binding: { storageTexture: { format: 'r32uint', access: 'write' } },
        frequency: 'stage',
        provider: 'private',
    }),
    marks: wgslResource({
        name: 'cloud_tiles',
        binding: { texture: { sample: 'u32' } },
        frequency: 'stage',
        provider: 'private',
    }),
    listOut: wgslResource({
        name: 'cloud_tile_list_out',
        binding: { storageTexture: { format: 'r32uint', access: 'write' } },
        frequency: 'stage',
        provider: 'private',
    }),
    list: wgslResource({
        name: 'cloud_tile_list',
        binding: { texture: { sample: 'u32' } },
        frequency: 'stage',
        provider: 'private',
    }),
    args: wgslResource({
        name: 'cloud_tile_args',
        binding: { storage: 'read_write' },
        type: { wgsl: 'atomic<u32>', array: true },
        frequency: 'stage',
        provider: 'private',
    }),
    /** As palavras lidas pela composição (a contagem), com o mesmo buffer como o despacho indireto. */
    argsRead: wgslResource({
        name: 'cloud_tile_args_read',
        binding: { storage: 'read' },
        type: { wgsl: 'u32', array: true },
        frequency: 'stage',
        provider: 'private',
    }),
});

/** A lista dos blocos com nuvem e os argumentos do despacho da composição (T074). */
export const cloudTilesKernel = wgslModule({
    name: 'cloud_tiles_kernel',
    source: cloudTilesSource,
    requires: [
        WORKGROUP_SIZE.module,
        CLOUD_TILE.module,
        cloudTiles.marks,
        cloudTiles.listOut,
        cloudTiles.args,
    ],
});

/** Aumento para a tela (sem e com amostras). */
export const cloudUpsampleKernel = {
    single: wgslModule({
        name: 'cloud_upsample',
        source: cloudUpsampleSource,
        requires: [
            cloudCommon,
            bayer,
            sceneLimit,
            sceneDepth.single,
            viewSpace,
            cameraSpace,
            cloudParamsResource,
            camerasResource,
            R.marchNow,
            R.marchDepthNow,
            cloudOutputs.view,
            CLOUD_TILE.module,
            constants,
            skyParamsResource,
            cloudTiles.marksOut,
            cloudTiles.args,
        ],
    }),
    multisampled: wgslModule({
        name: 'cloud_upsample_ms',
        source: cloudUpsampleSource,
        requires: [
            cloudCommon,
            bayer,
            sceneLimit,
            sceneDepth.multisampled,
            viewSpace,
            cameraSpace,
            cloudParamsResource,
            camerasResource,
            R.marchNow,
            R.marchDepthNow,
            cloudOutputs.view,
            CLOUD_TILE.module,
            constants,
            skyParamsResource,
            cloudTiles.marksOut,
            cloudTiles.args,
        ],
    }),
} as const;

/** O cache de espalhamento: um caminho por sonda na vez do grupo dela (T023). */
export const cloudScatterKernel = wgslModule({
    name: 'cloud_scatter',
    source: cloudScatterSource,
    requires: [
        WORKGROUP_SIZE.module,
        constants,
        random,
        xformRigid,
        cloudCommon,
        cloudDensity,
        cloudPhase,
        cloudSun,
        cloudShadowLookup,
        cloudScatterGrid,
        cloudScatterLookup,
        color,
        sky,
        cloudParamsResource,
        camerasResource,
        R.ambient,
        pageAlloc,
        cloudScatterPages,
        R.scatterWork,
        R.panorama,
        R.panoramaStamps,
        R.panoramaClock,
    ],
});

/** Os argumentos dos despachos indiretos dos caminhos e do filtro do cache, pela escolha do quadro (T074). */
export const cloudScatterArgsKernel = wgslModule({
    name: 'cloud_scatter_args_kernel',
    source: cloudScatterArgsSource,
    requires: [
        WORKGROUP_SIZE.module,
        cloudParamsResource,
        cloudScatterPages,
        R.scatterWork,
        R.scatterArgs,
    ],
});

/** O cache de espalhamento filtrado no espaço (T023): as sondas cuja vizinhança caminhou, pelo filtro binomial. */
export const cloudScatterFilterKernel = wgslModule({
    name: 'cloud_scatter_filter',
    source: cloudScatterFilterSource,
    requires: [
        WORKGROUP_SIZE.module,
        cloudParamsResource,
        cloudScatterPages,
        R.scatterCacheRead,
        R.scatterWork,
        R.scatterFilteredStamps,
        R.scatterFilteredClock,
        cloudOutputs.scatterFiltered,
    ],
});

/** Panorama das nuvens vistas da câmera. */
export const cloudPanoramaKernel = withFarShadow(
    wgslModule({
        name: 'cloud_panorama',
        source: cloudPanoramaSource,
        requires: [
            WORKGROUP_SIZE.module,
            constants,
            random,
            color,
            cloudIntegrate,
            skyAerialLookup,
            cloudParamsResource,
            cloudOutputs.panorama,
            cloudScatterPages,
            R.scatterWork,
            R.panoramaStamps,
            R.panoramaClock,
        ],
    }),
);

/** Invocações do grupo do desenho de uma página do volume de τ até o sol (um grupo por página da lista do quadro). */
export const CLOUD_SUN_VOLUME_DRAW_GROUP = sharedConstant(
    'CLOUD_SUN_VOLUME_DRAW_GROUP',
    256,
    'u32',
);

/** O volume de τ até o sol perto da câmera (T074): as filas das páginas, a escolha do quadro e o desenho. */
export const cloudSunVolumeKernel = wgslModule({
    name: 'cloud_sun_volume',
    source: cloudSunVolumeSource,
    requires: [
        CLOUD_SUN_VOLUME_DRAW_GROUP.module,
        cloudSunVolumeGrid,
        cloudSunRest,
        cloudCommon,
        cloudDensity,
        sky,
        cloudParamsResource,
        pageAlloc,
        cloudOutputs.sunVolume,
        R.sunVolumeWork,
        R.sunVolumeRecords,
        R.sunVolumeStamps,
        R.sunVolumeClock,
    ],
});

// ── Contribuições ───────────────────────────────────────────────────────────────────────────────────────────────────

/** `sky_cover` pelo panorama. */
export const cloudSkyCover = wgslModule({
    name: 'cloud_sky_cover',
    source: cloudCoverSource,
    requires: [constants, R.panorama, R.noiseSampler],
});

/** `light_volume_visibility` pela sombra das nuvens num ponto do ar (spec 041, R21; uma amostra por quadro). */
export const cloudVolumeVisibility = wgslModule({
    name: 'cloud_volume_visibility',
    source: cloudVolumeVisibilitySource,
    requires: [constants, random, skyParamsResource, cloudParamsResource, cloudShadowLookup],
});

/** `light_transmission` pela sombra das nuvens (só a luz do sol do `Sky`). */
export const cloudLightTransmission = wgslModule({
    name: 'cloud_light_transmission',
    source: cloudTransmissionSource,
    requires: [skyParamsResource, cloudShadowLookup],
});
