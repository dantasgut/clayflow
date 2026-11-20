import { wgslModule, type WgslModule } from '../../scene/shaders/WgslModule';
import { slot } from '../../scene/flows/slots';
import { wgslResource, type WgslResource } from '../../scene/shaders/WgslResource';
import { POINT_PARAMS, wgslPoint } from '../../scene/shaders/WgslPoint';
import type { BindablePoint } from '../../scene/shaders/bindPoints';
import { sharedConstant } from '../../scene/shaders/SharedConstant';
import { NONE, WORKGROUP_SIZE } from '../../scene/shaders/engineConstants';
import { camerasResource, lightsResource } from '../scene/resources';
import { lightIncoming } from '../scene/points/lightContributions';
import { lightTransmissionReady, lightVisibilityReady } from '../scene/points/lighting';
import { rayVolumeScatterTypes } from '../raytrace/points';
import {
    sceneAmbientReady,
    sceneFogType,
    sceneMediumOpenReady,
    sceneMediumReady,
    sceneNearFogType,
} from '../scene/points/media';
import froxelReachSource from '../gpu/wgsl/media/media_froxel_reach.wgsl?raw';
import froxelStateSource from '../gpu/wgsl/media/media_froxel_state.wgsl?raw';
import { FroxelsSchema, FROXEL_HISTORY, MEDIA_MARCH_STEPS } from './schemas';
import densityFnReadySource from '../gpu/wgsl/media/media_density_fn_ready.wgsl?raw';
import densityCheckSource from '../gpu/wgsl/media/media_density_check.wgsl?raw';
import mediaCommonSource from '../gpu/wgsl/media/media_common.wgsl?raw';
import mediaVolumesSource from '../gpu/wgsl/media/media_volumes.wgsl?raw';
import mediaLookupSource from '../gpu/wgsl/media/media_lookup.wgsl?raw';
import froxelInjectSource from '../gpu/wgsl/media/media_froxel_inject.wgsl?raw';
import froxelIntegrateSource from '../gpu/wgsl/media/media_froxel_integrate.wgsl?raw';
import froxelResolveSource from '../gpu/wgsl/media/media_froxel_resolve.wgsl?raw';
import froxelAmbientSource from '../gpu/wgsl/media/media_froxel_ambient.wgsl?raw';
import {
    camera as cameraMath,
    constants,
    hashAddress,
    random,
    temporal as temporalPieces,
    viewSpace,
} from '../gpu/shaders/math';

// Meios participantes (spec 033, R12): os recursos dos froxels e dos volumes, o ponto `fog_density` das funções de
// densidade, a leitura da névoa no desenho (`scene_fog`), a transmitância nos raios e na luz que chega, e os kernels
// dos froxels (injeção com acúmulo reprojetado, integração da frente para trás).

const MEDIA_STEPS = sharedConstant('MEDIA_MARCH_STEPS', MEDIA_MARCH_STEPS, 'u32');
const HISTORY = sharedConstant('FROXEL_HISTORY', FROXEL_HISTORY, 'f32');

/** Parâmetros dos froxels (resolver `Froxels.params`). */
const params = wgslResource({
    name: 'froxels',
    binding: { uniform: true },
    type: { schema: FroxelsSchema },
    frequency: 'frame',
    provider: { consumer: 'Froxels.params' },
});

/** Os volumes e as grades num buffer só (resolver `Froxels.media`): uma ligação de storage nos kernels dos raios. */
const media = wgslResource({
    name: 'fog_media',
    binding: { storage: 'read' },
    type: { wgsl: 'vec4f', array: true },
    frequency: 'frame',
    provider: { consumer: 'Froxels.media' },
});

const texture3d = (name: string, consumer: string): WgslResource =>
    wgslResource({
        name,
        binding: { texture: { sample: 'f32', dimension: '3d' } },
        frequency: 'frame',
        provider: { consumer },
    });

const out3d = (name: string, format: GPUTextureFormat = 'rgba16float'): WgslResource =>
    wgslResource({
        name,
        binding: { storageTexture: { format, access: 'write', dimension: '3d' } },
        frequency: 'stage',
        provider: 'private',
    });

/** O slot do canal do histórico no estágio dos froxels (spec 037). */
export const froxelHistorySlot = Object.freeze({
    froxelHistory: slot.channel(FroxelsSchema, 'history'),
});

/** Fatia do histórico lida: a do quadro anterior (1, na injeção) ou a do quadro (0, na integração). */
const history3d = (lag: 0 | 1): WgslResource =>
    wgslResource({
        name: 'froxel_history',
        binding: { texture: { sample: 'f32', dimension: '3d' } },
        frequency: 'stage',
        provider: { slot: 'froxelHistory', lag },
    });

/** A fatia do quadro escrita pelo acúmulo, no formato resolvido do canal. */
const historyOut = (format: GPUTextureFormat): WgslResource =>
    wgslResource({
        name: 'froxel_history_out',
        binding: { storageTexture: { format, access: 'write', dimension: '3d' } },
        frequency: 'stage',
        provider: { slot: 'froxelHistory', lag: 0 },
    });

/** O slot do canal do alcance (spec 041, R21): a distância vista e a decisão do meio contínuo, quadro a quadro. */
export const froxelReachSlot = Object.freeze({
    froxelReach: slot.channel(FroxelsSchema, 'reach'),
});

/** O alcance do quadro anterior (lido pela grade e pela redução) e a escrita do quadro (pela redução). */
const reachPrevious = wgslResource({
    name: 'froxel_reach_prev',
    binding: { texture: { sample: 'f32' } },
    frequency: 'stage',
    provider: { slot: 'froxelReach', lag: 1 },
});
const reachOut = wgslResource({
    name: 'froxel_reach_out',
    binding: { storageTexture: { format: 'rgba32float', access: 'write' } },
    frequency: 'stage',
    provider: { slot: 'froxelReach', lag: 0 },
});
/** A palavra do máximo da redução (resolver `Froxels.reachMax`). */
const reachMax = wgslResource({
    name: 'froxel_reach_max',
    binding: { storage: 'read_write' },
    type: { wgsl: 'atomic<u32>', array: true },
    frequency: 'frame',
    provider: { consumer: 'Froxels.reachMax' },
});

/** A decisão do quadro (spec 041, R21; resolver `Froxels.state`): lida por quem consulta a grade. */
const stateTexture = wgslResource({
    name: 'froxel_state',
    binding: { texture: { sample: 'f32' } },
    frequency: 'frame',
    provider: { consumer: 'Froxels.state' },
});
/** A escrita da decisão no começo da grade (privada do estágio). */
const stateOut = wgslResource({
    name: 'froxel_state_out',
    binding: { storageTexture: { format: 'rgba8unorm', access: 'write' } },
    frequency: 'stage',
    provider: 'private',
});

/** Os argumentos do despacho indireto da grade (resolver `Froxels.dispatch`), escritos pela decisão do quadro. */
const dispatchArgs = wgslResource({
    name: 'froxel_dispatch',
    binding: { storage: 'read_write' },
    type: { wgsl: 'u32', array: true },
    frequency: 'frame',
    provider: { consumer: 'Froxels.dispatch' },
});

/** Recursos dos meios. */
export const mediaResources = Object.freeze({
    params,
    media,
    scatter: texture3d('froxel_scatter', 'Froxels.scatter'),
    sampler: wgslResource({
        name: 'froxel_sampler',
        binding: { sampler: 'filtering' },
        frequency: 'frame',
        provider: { consumer: 'Froxels.sampler' },
    }),
    /** O histórico: a fatia do quadro anterior (lida na injeção) e a do quadro (lida na integração). */
    historyPrevious: history3d(1),
    historyCurrent: history3d(0),
    /** A luz ambiente na grade grossa (lida na injeção) e a saída do kernel que a escreve. */
    ambient: texture3d('froxel_ambient', 'Froxels.ambient'),
    ambientOut: out3d('froxel_ambient_out'),
    scatterOut: out3d('froxel_scatter_out'),
    /** O quadro da injeção (antes do acúmulo): a saída dela e a leitura do acúmulo (T058). */
    currentOut: out3d('froxel_current_out'),
    current: texture3d('froxel_current', 'Froxels.current'),
    /** A decisão do quadro: a escrita (no começo da grade) e a leitura. */
    stateOut,
    state: stateTexture,
    /** A luz do meio contínuo sem sombra por coluna (R21 rodada 16): a escrita (na integração) e a leitura. */
    openOut: wgslResource({
        name: 'froxel_open_out',
        binding: { storageTexture: { format: 'rgba16float', access: 'write' } },
        frequency: 'stage',
        provider: 'private',
    }),
    open: wgslResource({
        name: 'froxel_open',
        binding: { texture: { sample: 'f32' } },
        frequency: 'frame',
        provider: { consumer: 'Froxels.open' },
    }),
});

const R = mediaResources;

/** Função pronta do ponto `fog_density` (o meio homogêneo). */
const densityFnReady = wgslModule({
    name: 'fog_density_fn_ready',
    source: densityFnReadySource,
});

/** Kernel de validação das `DensityFunction` (não é despachado). */
const densityCheck = wgslModule({
    name: 'fog_density_check',
    source: densityCheckSource,
    requires: [
        densityFnReady,
        wgslResource({
            name: 'fog_density_check_out',
            binding: { storage: 'read_write' },
            type: { wgsl: 'vec4f', array: true },
            frequency: 'draw',
            provider: 'private',
        }),
    ],
});

/**
 * Ponto `fog_density` (spec 033, R12): `fn density_fn(p: vec3f, time: f32, data: DensityFnParams) -> f32` — a densidade
 * relativa do meio no ponto (mundo) no tempo simulado (multiplica a extinção do `FogVolume`). Por volume: a composição
 * das funções da cena escolhe pela do volume (`fogDensityAtPoint`). Disponíveis para a função: os módulos declarados
 * em `requires` (ex.: `wgslLib.noise`) ou os dos nós.
 */
export const fogDensityPoint = wgslPoint({
    name: 'fog_density',
    required: {
        name: 'density_fn',
        params: ['vec3f', 'f32', POINT_PARAMS],
        returns: 'f32',
        names: ['p', 'time', 'data'],
    },
    paramsAlias: 'DensityFnParams',
    ready: densityFnReady,
    hosts: () => [densityCheck],
});

/** `fog_density_at` pronto: densidade relativa 1 em todo volume. */
const densityAtReady = wgslModule({
    name: 'fog_density_at_ready',
    source: 'fn fog_density_at(index: u32, p: vec3f, time: f32, slot: u32) -> f32 {\n    return 1.0;\n}',
});

/**
 * Lugar da composição das funções de densidade (spec 033, R12): o estágio dos froxels e o recurso deles trocam o pronto
 * pelo `switch` das funções da cena (`bindPoints`), escolhendo pelo índice gravado no volume.
 */
export const fogDensityAtPoint: BindablePoint = {
    name: 'fog_density_at',
    ready: densityAtReady,
};

/** Fatias dos froxels e a ida e volta entre a tela, a profundidade da vista e o mundo. */
const mediaCommon = wgslModule({
    name: 'media_common',
    source: mediaCommonSource,
    requires: [cameraMath, viewSpace, random, hashAddress, params, camerasResource],
});

/** Se o meio contínuo conta neste quadro e no anterior (spec 041, R21), pelo canal do alcance. */
const froxelState = wgslModule({
    name: 'media_froxel_state',
    source: froxelStateSource,
    requires: [params, reachPrevious],
});

/** Volumes no buffer dos meios: forma, borda, densidade, trecho do raio e transmitância. */
export const mediaVolumes = wgslModule({
    name: 'media_volumes',
    source: mediaVolumesSource,
    requires: [params, media, MEDIA_STEPS.module, densityAtReady],
});

/** Lugar dos volumes (a composição das funções de densidade troca o módulo uma vez para todos que o usam). */
export const mediaVolumesPoint: BindablePoint = {
    name: 'media_volumes',
    ready: mediaVolumes,
};

/** A leitura tricúbica dos froxels integrados (`froxel_fog`). */
const mediaFroxelFog = wgslModule({
    name: 'media_froxel_fog',
    source: mediaLookupSource,
    requires: [mediaCommon, R.scatter, R.sampler, R.state, sceneFogType],
});

/** A névoa no desenho (`scene_fog`): a leitura dos froxels integrados. */
export const mediaLookup = wgslModule({
    name: 'media_lookup',
    requires: [mediaFroxelFog, sceneFogType],
    source: `fn scene_fog(p: vec3f) -> SceneFog {
    return froxel_fog(p);
}`,
});

/**
 * Os meios perto da câmera (`scene_near_fog`, spec 041 R21): a leitura dos froxels até o ponto; sem o meio contínuo na
 * grade, alcance 0.
 */
export const mediaNearFog = wgslModule({
    name: 'media_near_fog',
    requires: [mediaFroxelFog, sceneNearFogType],
    source: `fn scene_near_fog(p: vec3f) -> SceneNearFog {
    return SceneNearFog(froxel_fog(p), 0.0, vec3f(0.0));
}`,
});

/**
 * Os meios perto da câmera com o meio contínuo na grade (spec 041, R21): a leitura e o alcance dela ao longo do raio da
 * câmera para o ponto — a última fatia é o plano da profundidade da vista `froxels.depth.y` — e a luz do meio sem sombra
 * até o fim da grade na coluna do ponto (`open`, o que o fundo tira da vista do céu).
 */
export const mediaNearFogMedium = wgslModule({
    name: 'media_near_fog_medium',
    requires: [mediaFroxelFog, sceneNearFogType, R.open],
    source: `fn scene_near_fog(p: vec3f) -> SceneNearFog {
    let fog = froxel_fog(p);
    if (!froxel_in_use()) { return SceneNearFog(fog, 0.0, vec3f(0.0)); }
    let cam = cameras[froxels.grid.w];
    let z = -(cam.view * vec4f(p, 1.0)).z;
    if (z <= 0.0) { return SceneNearFog(fog, 0.0, vec3f(0.0)); }
    let f = froxel_locate(cam.view, cam.unjitteredViewProjection, p);
    let open = textureSampleLevel(froxel_open, froxel_sampler, clamp(f.xy, vec2f(0.0), vec2f(1.0)), 0.0).rgb;
    return SceneNearFog(fog, froxels.depth.y * distance(p, cam.position.xyz) / z, open);
}`,
});

/** Transmitância dos volumes nos raios (`ray_volume_transmittance`). */
export const mediaRayTransmittance = wgslModule({
    name: 'media_ray_transmittance',
    source: `fn ray_volume_transmittance(origin: vec3f, dir: vec3f, t_max: f32, time: f32) -> vec3f {
    return vec3f(fog_transmittance(origin, dir, t_max));
}`,
    requires: [mediaVolumes],
});

/** Transmitância só da névoa nos raios (`ray_media_transmittance`): a mesma dos volumes, sem os da cena. */
export const mediaRayMediaTransmittance = wgslModule({
    name: 'media_ray_media_transmittance',
    source: `fn ray_media_transmittance(origin: vec3f, dir: vec3f, t_max: f32) -> vec3f {
    return vec3f(fog_transmittance(origin, dir, t_max));
}`,
    requires: [mediaVolumes],
});

/**
 * Espalhamento dos volumes nos raios (\`ray_volume_scatter\`, spec 034 T058): no ponto sorteado do trecho, os
 * coeficientes de todos os volumes (o de espalhamento pelo albedo de cada um, a anisotropia pesada pelo espalhamento) e
 * a transmitância da origem até ele.
 */
export const mediaRayScatter = wgslModule({
    name: 'media_ray_scatter',
    source: `fn ray_volume_scatter(origin: vec3f, dir: vec3f, t_max: f32, u: f32) -> RayVolumeScatter {
    let t = u * t_max;
    let p = origin + dir * t;
    var sigma_t = 0.0;
    var sigma_s = vec3f(0.0);
    var g_sum = 0.0;
    let count = fog_count();
    for (var k = 0u; k < count; k++) {
        let v = fog_record(k);
        if (v.albedo.a < 0.5) { continue; }
        let d = fog_density(v, p);
        if (d <= 0.0) { continue; }
        sigma_t += d;
        let s = v.albedo.rgb * d;
        sigma_s += s;
        g_sum += v.optics.y * (s.r + s.g + s.b);
    }
    if (sigma_t <= 0.0) { return RayVolumeScatter(p, vec3f(0.0), 0.0, 0.0); }
    let s_sum = max(sigma_s.r + sigma_s.g + sigma_s.b, 1e-12);
    return RayVolumeScatter(p, fog_transmittance(origin, dir, t) * sigma_s * t_max, s_sum / (3.0 * sigma_t), g_sum / s_sum);
}`,
    requires: [rayVolumeScatterTypes, mediaVolumes],
});

/**
 * Transmitância dos volumes na luz que chega a um ponto (`light_transmission`): a névoa entre ele e a fonte (a
 * direcional até sair de todos). A luz ambiente (`NONE`) passa inteira — o espalhado já a conta.
 */
export const mediaLightTransmission = wgslModule({
    name: 'media_light_transmission',
    source: `fn light_transmission(light: u32, p: vec3f) -> vec3f {
    if (light == NONE) { return vec3f(1.0); }
    let inc = light_incoming(lights[light], p);
    return vec3f(fog_transmittance(p, inc.l, min(inc.dist, 1e6)));
}`,
    requires: [NONE.module, mediaVolumes, lightsResource, lightIncoming],
});

/** A névoa dos volumes entre um ponto do ar e a fonte (`light_volume_visibility`, spec 041 R21): a do `light_transmission`. */
export const mediaVolumeVisibility = wgslModule({
    name: 'media_volume_visibility',
    source: `fn light_volume_visibility(light: u32, p: vec3f) -> vec3f {
    if (light == NONE) { return vec3f(1.0); }
    let inc = light_incoming(lights[light], p);
    return vec3f(fog_transmittance(p, inc.l, min(inc.dist, 1e6)));
}`,
    requires: [NONE.module, mediaVolumes, lightsResource, lightIncoming],
});

/** Injeção nos froxels: o quadro, sem o acúmulo (o do `media_froxel_resolve`, T058). */
export const froxelInject = wgslModule({
    name: 'media_froxel_inject',
    source: froxelInjectSource,
    requires: [
        constants,
        WORKGROUP_SIZE.module,
        mediaCommon,
        mediaVolumes,
        lightsResource,
        lightIncoming,
        lightVisibilityReady,
        lightTransmissionReady,
        sceneMediumReady,
        froxelState,
        R.ambient,
        R.sampler,
        R.currentOut,
    ],
});

/**
 * O acúmulo com o recorte do histórico pela vizinhança do quadro (T058): lê a fatia do quadro anterior do canal do
 * histórico e escreve a do quadro, no formato resolvido do canal (spec 037: a precisão é da C2; o formato escrito é
 * parte do WGSL).
 */
function resolve(format: GPUTextureFormat): WgslModule {
    return wgslModule({
        name: `media_froxel_resolve${format === 'rgba32float' ? '_full' : ''}`,
        source: froxelResolveSource,
        requires: [
            temporalPieces,
            WORKGROUP_SIZE.module,
            HISTORY.module,
            mediaCommon,
            froxelState,
            R.current,
            R.sampler,
            R.historyPrevious,
            historyOut(format),
        ],
    });
}

/** Integração da frente para trás por coluna (lê a fatia do histórico escrita no quadro). */
export const froxelIntegrate = wgslModule({
    name: 'media_froxel_integrate',
    source: froxelIntegrateSource,
    requires: [
        WORKGROUP_SIZE.module,
        mediaCommon,
        froxelState,
        sceneMediumOpenReady,
        R.historyCurrent,
        R.scatterOut,
        R.openOut,
    ],
});

/** A decisão do quadro no texel lido pelo desenho (a primeira invocação da grade; spec 041, R21). */
export const froxelDecide = wgslModule({
    name: 'media_froxel_decide',
    requires: [WORKGROUP_SIZE.module, params, froxelState, R.stateOut, dispatchArgs],
    source: `/** Os grupos de um despacho linear de \`n\` invocações (como o \`invocations\` da C2; 65 535 por eixo, o mínimo do WebGPU). */
fn froxel_groups(n: u32, at: u32) {
    let groups = (n + WORKGROUP_SIZE - 1u) / WORKGROUP_SIZE;
    let x = min(groups, 65535u);
    froxel_dispatch[at] = x;
    froxel_dispatch[at + 1u] = select(0u, (groups + x - 1u) / max(x, 1u), groups > 0u);
    froxel_dispatch[at + 2u] = select(0u, 1u, groups > 0u);
}

@compute @workgroup_size(1)
fn froxel_decide_main() {
    let s = froxel_medium_state();
    textureStore(froxel_state_out, vec2u(0u), vec4f(select(0.0, 1.0, s.x), select(0.0, 1.0, s.y), 0.0, 1.0));
    // Sem o meio nem névoa neste quadro, a injeção, o acúmulo e a integração não despacham nenhum grupo.
    let d = froxels.grid.xyz;
    froxel_groups(select(0u, d.x * d.y * d.z, s.x), 0u);
    froxel_groups(select(0u, d.x * d.y, s.x), 4u);
}`,
});

/** A luz ambiente na grade grossa (antes da injeção). */
export const froxelAmbient = wgslModule({
    name: 'media_froxel_ambient',
    source: froxelAmbientSource,
    requires: [WORKGROUP_SIZE.module, mediaCommon, sceneAmbientReady, R.ambientOut],
});

/** A profundidade da cena lida pela redução do alcance (com e sem MSAA), privada do estágio que a liga. */
export const froxelReachDepth = Object.freeze({
    single: wgslResource({
        name: 'froxel_reach_depth',
        binding: { texture: { sample: 'depth' } },
        frequency: 'stage',
        provider: 'private',
    }),
    multisampled: wgslResource({
        name: 'froxel_reach_depth',
        binding: { texture: { sample: 'depth', multisampled: true } },
        frequency: 'stage',
        provider: 'private',
    }),
});

const reachDepthRead = (multisampled: boolean): WgslModule =>
    wgslModule({
        name: `media_froxel_reach_depth${multisampled ? '_ms' : ''}`,
        requires: [multisampled ? froxelReachDepth.multisampled : froxelReachDepth.single],
        source: `fn froxel_reach_depth_at(px: vec2u) -> f32 {
    return textureLoad(froxel_reach_depth, px, 0);
}

fn froxel_reach_depth_size() -> vec2u {
    return textureDimensions(froxel_reach_depth);
}`,
    });

const reachKernels = [false, true].map((multisampled) =>
    wgslModule({
        name: `media_froxel_reach${multisampled ? '_ms' : ''}`,
        source: froxelReachSource,
        requires: [
            WORKGROUP_SIZE.module,
            mediaCommon,
            froxelState,
            sceneMediumOpenReady,
            reachDepthRead(multisampled),
            reachMax,
            reachPrevious,
            reachOut,
        ],
    }),
);

/**
 * A redução do alcance (spec 041, R21): a maior distância da profundidade da cena e a decisão do meio contínuo do quadro
 * seguinte (`froxel_reach_reduce_main`, um pixel por invocação, e `froxel_reach_final_main`, uma invocação).
 */
export function froxelReachKernel(multisampled: boolean): WgslModule {
    return reachKernels[multisampled ? 1 : 0]!;
}

const resolves = new Map<GPUTextureFormat, WgslModule>();

/** O acúmulo que escreve o histórico no formato dado (o `format` do canal; criado uma vez por formato). */
export function froxelResolveFor(format: GPUTextureFormat): WgslModule {
    let made = resolves.get(format);
    if (made === undefined) resolves.set(format, (made = resolve(format)));
    return made;
}

/** O acúmulo na precisão padrão (`half`). */
export const froxelResolve = froxelResolveFor('rgba16float');
