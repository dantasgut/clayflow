import { POINT_PARAMS, wgslPoint } from '../../../scene/shaders/WgslPoint';
import type { BindablePoint } from '../../../scene/shaders/bindPoints';
import { wgslModule, type WgslModule } from '../../../scene/shaders/WgslModule';
import { wgslResource, type WgslResource } from '../../../scene/shaders/WgslResource';
import { slot } from '../../../scene/flows/slots';
import { camerasResource } from '../../scene/resources';
import { cameraSpace } from '../../scene/flows/shaders';
import { sky, skyAerialLookup, skyParamsResource } from '../../scene/sky/shaders';
import { color, constants, random, viewSpace, xformRigid } from '../../gpu/shaders/math';
import { WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import { CloudSchema } from './schemas';
import cloudCommonSource from '../../gpu/wgsl/clouds/cloud_common.wgsl?raw';
import cloudPhaseSource from '../../gpu/wgsl/clouds/cloud_phase.wgsl?raw';
import cloudDensitySource from '../../gpu/wgsl/clouds/cloud_density.wgsl?raw';
import cloudShadowLookupSource from '../../gpu/wgsl/clouds/cloud_shadow_lookup.wgsl?raw';
import cloudLightSource from '../../gpu/wgsl/clouds/cloud_light.wgsl?raw';
import cloudNoiseSource from '../../gpu/wgsl/clouds/cloud_noise.wgsl?raw';
import cloudCoverageSource from '../../gpu/wgsl/clouds/cloud_coverage.wgsl?raw';
import cloudAmbientSource from '../../gpu/wgsl/clouds/cloud_ambient.wgsl?raw';
import cloudShadowSource from '../../gpu/wgsl/clouds/cloud_shadow.wgsl?raw';
import cloudBayerSource from '../../gpu/wgsl/clouds/cloud_march_bayer.wgsl?raw';
import cloudMarchSource from '../../gpu/wgsl/clouds/cloud_march.wgsl?raw';
import cloudReconstructSource from '../../gpu/wgsl/clouds/cloud_reconstruct.wgsl?raw';
import cloudUpsampleSource from '../../gpu/wgsl/clouds/cloud_upsample.wgsl?raw';
import cloudPanoramaSource from '../../gpu/wgsl/clouds/cloud_panorama.wgsl?raw';
import cloudCoverSource from '../../gpu/wgsl/clouds/cloud_cover.wgsl?raw';
import cloudTransmissionSource from '../../gpu/wgsl/clouds/cloud_transmission.wgsl?raw';
import cloudCoverageFieldSource from '../../gpu/wgsl/clouds/cloud_coverage_field.wgsl?raw';
import cloudScatterLookupSource from '../../gpu/wgsl/clouds/cloud_scatter_lookup.wgsl?raw';
import cloudScatterGridSource from '../../gpu/wgsl/clouds/cloud_scatter_grid.wgsl?raw';
import cloudSunSource from '../../gpu/wgsl/clouds/cloud_sun.wgsl?raw';
import cloudScatterSource from '../../gpu/wgsl/clouds/cloud_scatter.wgsl?raw';
import cloudScatterFilterSource from '../../gpu/wgsl/clouds/cloud_scatter_filter.wgsl?raw';
import { nodeNoise } from '../../nodes/shaders';

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

const sampled = (name: string, id: string, dimension: '2d' | '3d' = '2d'): WgslResource =>
    wgslResource({
        name,
        binding: { texture: { sample: 'f32', dimension } },
        frequency: 'frame',
        provider: { consumer: `CloudLayer.${id}` },
    });

const out = (name: string, format: GPUTextureFormat, dimension: '2d' | '3d' = '2d'): WgslResource =>
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

/** Slot do canal temporal do cache de espalhamento (spec 037; T023). */
export const cloudScatterSlots = Object.freeze({
    cloudScatter: slot.channel(CloudSchema, 'scatter'),
});

/** Slot do canal temporal do sol do cache de espalhamento (T023). */
export const cloudScatterSunSlots = Object.freeze({
    cloudScatterSun: slot.channel(CloudSchema, 'scatterSun'),
});

/** Recursos da camada. */
export const cloudResources = Object.freeze({
    params: cloudParamsResource,
    shape: sampled('cloud_shape_tex', 'shape', '3d'),
    detail: sampled('cloud_detail_tex', 'detail', '3d'),
    coverage: sampled('cloud_coverage_tex', 'coverage'),
    ambient: sampled('cloud_ambient_tex', 'ambient'),
    shadow: sampled('cloud_shadow_tex', 'shadow', '3d'),
    panorama: sampled('cloud_panorama_tex', 'panorama'),
    view: sampled('cloud_view_tex', 'view'),
    /** O cache de espalhamento filtrado no espaço (o que a marcha e o panorama leem). */
    scatterFiltered: sampled('cloud_scatter_filtered_tex', 'scatterFiltered', '3d'),
    trace: sampled('cloud_trace', 'trace'),
    traceDepth: sampled('cloud_trace_depth', 'traceDepth'),
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
    marchDepthOut: wgslResource({
        name: 'cloud_march_depth_out',
        binding: { storageTexture: { format: 'r32float', access: 'write' } },
        frequency: 'stage',
        provider: { slot: 'cloudMarchDepth', lag: 0 },
    }),
    /** O cache de espalhamento: a fatia do quadro (lida filtrada na marcha e no panorama), a anterior e a escrita. */
    scatterNow: wgslResource({
        name: 'cloud_scatter_tex',
        binding: { texture: { sample: 'f32', dimension: '3d' } },
        frequency: 'stage',
        provider: { slot: 'cloudScatter', lag: 0 },
    }),
    scatterPrevious: wgslResource({
        name: 'cloud_scatter_prev',
        binding: { texture: { sample: 'f32', dimension: '3d' } },
        frequency: 'stage',
        provider: { slot: 'cloudScatter', lag: 1 },
    }),
    scatterOut: wgslResource({
        name: 'cloud_scatter_out',
        binding: { storageTexture: { format: 'rgba16float', access: 'write', dimension: '3d' } },
        frequency: 'stage',
        provider: { slot: 'cloudScatter', lag: 0 },
    }),
    scatterSunPrevious: wgslResource({
        name: 'cloud_scatter_sun_prev',
        binding: { texture: { sample: 'f32' } },
        frequency: 'stage',
        provider: { slot: 'cloudScatterSun', lag: 1 },
    }),
    scatterSunOut: wgslResource({
        name: 'cloud_scatter_sun_out',
        binding: { storageTexture: { format: 'rgba32float', access: 'write' } },
        frequency: 'stage',
        provider: { slot: 'cloudScatterSun', lag: 0 },
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
    coverage: out('cloud_coverage_out', 'rgba8unorm'),
    ambient: out('cloud_ambient_out', 'rgba16float'),
    shadow: out('cloud_shadow_out', 'rgba16float', '3d'),
    trace: out('cloud_trace_out', 'rgba16float'),
    traceDepth: out('cloud_trace_depth_out', 'r32float'),
    view: out('cloud_view_out', 'rgba16float'),
    panorama: out('cloud_panorama_out', 'rgba16float'),
    /**
     * O cache filtrado, escrito pelo consumidor da camada (não pela ligação privada do estágio): o grupo do filtro
     * também lê a série do cache, e a C2 o refaz quando a série muda (a camada que sai, o perfil que redimensiona) —
     * com a saída resolvida pela camada, a vista é a do descritor de agora.
     */
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

/** Lugar da função de forma no kernel dos volumes (o estágio troca o pronto pela composta, `bindPoints`). */
export const cloudShapeAtPoint: BindablePoint = { name: 'cloud_shape_at', ready: shapeAtReady };
/** Lugar da função de cobertura no kernel do mapa. */
export const cloudCoverageAtPoint: BindablePoint = {
    name: 'cloud_coverage_fn_at',
    ready: coverageAtReady,
};

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

/** A densidade (cobertura, perfil, forma, erosão). */
export const cloudDensity = wgslModule({
    name: 'cloud_density',
    source: cloudDensitySource,
    requires: [
        coverageField,
        cloudCommon,
        cloudParamsResource,
        R.shape,
        R.detail,
        R.coverage,
        R.noiseSampler,
        R.clampSampler,
    ],
});

/** A transmitância até o sol pelo mapa visto do sol. */
export const cloudShadowLookup = wgslModule({
    name: 'cloud_shadow_lookup',
    source: cloudShadowLookupSource,
    requires: [cloudCommon, cloudParamsResource, R.shadow, R.clampSampler],
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

/** A leitura do cache de espalhamento filtrado (T023). */
export const cloudScatterLookup = wgslModule({
    name: 'cloud_scatter_lookup',
    source: cloudScatterLookupSource,
    requires: [cloudScatterGrid, sky, cloudParamsResource, R.scatterFiltered, R.clampSampler],
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
        cloudSun,
        sky,
        cloudParamsResource,
        R.ambient,
    ],
});

const bayer = wgslModule({ name: 'cloud_march_bayer', source: cloudBayerSource });

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

/** Mapa de cobertura pela função de cobertura (lugar `cloud_coverage_fn_at`). */
export const cloudCoverageKernel = wgslModule({
    name: 'cloud_coverage',
    source: cloudCoverageSource,
    requires: [WORKGROUP_SIZE.module, cloudParamsResource, coverageAtReady, cloudOutputs.coverage],
});

/** Irradiâncias do céu e do chão. */
export const cloudAmbientKernel = wgslModule({
    name: 'cloud_ambient',
    source: cloudAmbientSource,
    requires: [WORKGROUP_SIZE.module, constants, sky, skyParamsResource, cloudOutputs.ambient],
});

/** Mapa de transmitância visto do sol. */
export const cloudShadowKernel = wgslModule({
    name: 'cloud_shadow',
    source: cloudShadowSource,
    requires: [
        WORKGROUP_SIZE.module,
        cloudCommon,
        cloudDensity,
        cloudParamsResource,
        cloudOutputs.shadow,
    ],
});

/** Marcha principal (sem e com amostras na profundidade da cena). */
export const cloudMarchKernel = {
    single: wgslModule({
        name: 'cloud_march',
        source: cloudMarchSource,
        requires: [
            WORKGROUP_SIZE.module,
            bayer,
            cloudLight,
            sceneDepth.single,
            viewSpace,
            cameraSpace,
            skyAerialLookup,
            random,
            cloudParamsResource,
            camerasResource,
            cloudOutputs.trace,
            cloudOutputs.traceDepth,
        ],
    }),
    multisampled: wgslModule({
        name: 'cloud_march_ms',
        source: cloudMarchSource,
        requires: [
            WORKGROUP_SIZE.module,
            bayer,
            cloudLight,
            sceneDepth.multisampled,
            viewSpace,
            cameraSpace,
            skyAerialLookup,
            random,
            cloudParamsResource,
            camerasResource,
            cloudOutputs.trace,
            cloudOutputs.traceDepth,
        ],
    }),
} as const;

/** Reconstrução temporal no alvo de ¼. */
export const cloudReconstructKernel = wgslModule({
    name: 'cloud_reconstruct',
    source: cloudReconstructSource,
    requires: [
        WORKGROUP_SIZE.module,
        color,
        bayer,
        viewSpace,
        cameraSpace,
        cloudParamsResource,
        camerasResource,
        R.trace,
        R.traceDepth,
        R.marchPrevious,
        R.marchDepthPrevious,
        R.clampSampler,
        R.marchOut,
        R.marchDepthOut,
    ],
});

/** Aumento para a tela (sem e com amostras). */
export const cloudUpsampleKernel = {
    single: wgslModule({
        name: 'cloud_upsample',
        source: cloudUpsampleSource,
        requires: [
            WORKGROUP_SIZE.module,
            sceneDepth.single,
            viewSpace,
            cameraSpace,
            cloudParamsResource,
            camerasResource,
            R.marchNow,
            cloudOutputs.view,
        ],
    }),
    multisampled: wgslModule({
        name: 'cloud_upsample_ms',
        source: cloudUpsampleSource,
        requires: [
            WORKGROUP_SIZE.module,
            sceneDepth.multisampled,
            viewSpace,
            cameraSpace,
            cloudParamsResource,
            camerasResource,
            R.marchNow,
            cloudOutputs.view,
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
        sky,
        cloudParamsResource,
        camerasResource,
        R.ambient,
        R.scatterPrevious,
        R.scatterOut,
        R.scatterSunPrevious,
        R.scatterSunOut,
    ],
});

/**
 * O cache de espalhamento filtrado no espaço (T023): a fatia do quadro anterior (a última completa: os caminhos do quadro
 * vêm depois, sobrepostos ao resto dele) pelo filtro binomial 3 × 3 × 3.
 */
export const cloudScatterFilterKernel = wgslModule({
    name: 'cloud_scatter_filter',
    source: cloudScatterFilterSource,
    requires: [
        WORKGROUP_SIZE.module,
        cloudScatterGrid,
        R.scatterPrevious,
        R.clampSampler,
        cloudOutputs.scatterFiltered,
    ],
});

/** Panorama das nuvens vistas da câmera. */
export const cloudPanoramaKernel = wgslModule({
    name: 'cloud_panorama',
    source: cloudPanoramaSource,
    requires: [
        WORKGROUP_SIZE.module,
        constants,
        cloudLight,
        skyAerialLookup,
        cloudParamsResource,
        cloudOutputs.panorama,
    ],
});

// ── Contribuições ───────────────────────────────────────────────────────────────────────────────────────────────────

/** `sky_cover` pelo panorama. */
export const cloudSkyCover = wgslModule({
    name: 'cloud_sky_cover',
    source: cloudCoverSource,
    requires: [constants, R.panorama, R.noiseSampler],
});

/** `light_transmission` pela sombra das nuvens (só a luz do sol do `Sky`). */
export const cloudLightTransmission = wgslModule({
    name: 'cloud_light_transmission',
    source: cloudTransmissionSource,
    requires: [skyParamsResource, cloudShadowLookup],
});
