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
import { sceneAmbientReady } from '../scene/points/media';
import { FroxelsSchema, FROXEL_HISTORY, MEDIA_MARCH_STEPS } from './schemas';
import densityFnReadySource from '../gpu/wgsl/media/media_density_fn_ready.wgsl?raw';
import densityCheckSource from '../gpu/wgsl/media/media_density_check.wgsl?raw';
import mediaCommonSource from '../gpu/wgsl/media/media_common.wgsl?raw';
import mediaVolumesSource from '../gpu/wgsl/media/media_volumes.wgsl?raw';
import mediaLookupSource from '../gpu/wgsl/media/media_lookup.wgsl?raw';
import froxelInjectSource from '../gpu/wgsl/media/media_froxel_inject.wgsl?raw';
import froxelIntegrateSource from '../gpu/wgsl/media/media_froxel_integrate.wgsl?raw';
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

/** A fatia do quadro escrita pela injeção, no formato resolvido do canal. */
const historyOut = (format: GPUTextureFormat): WgslResource =>
    wgslResource({
        name: 'froxel_history_out',
        binding: { storageTexture: { format, access: 'write', dimension: '3d' } },
        frequency: 'stage',
        provider: { slot: 'froxelHistory', lag: 0 },
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

/** A névoa no desenho (`scene_fog`): leitura tricúbica dos froxels integrados. */
export const mediaLookup = wgslModule({
    name: 'media_lookup',
    source: mediaLookupSource,
    requires: [mediaCommon, R.scatter, R.sampler],
});

/** Transmitância dos volumes nos raios (`ray_volume_transmittance`). */
export const mediaRayTransmittance = wgslModule({
    name: 'media_ray_transmittance',
    source: `fn ray_volume_transmittance(origin: vec3f, dir: vec3f, t_max: f32, time: f32) -> vec3f {
    return vec3f(fog_transmittance(origin, dir, t_max));
}`,
    requires: [mediaVolumes],
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

/**
 * Injeção nos froxels com o acúmulo reprojetado: lê a fatia do quadro anterior do canal do histórico e escreve a do
 * quadro, no formato resolvido do canal (spec 037: a precisão é da C2; o formato escrito é parte do WGSL).
 */
function inject(format: GPUTextureFormat): WgslModule {
    return wgslModule({
        name: `media_froxel_inject${format === 'rgba32float' ? '_full' : ''}`,
        source: froxelInjectSource,
        requires: [
            temporalPieces,
            constants,
            WORKGROUP_SIZE.module,
            HISTORY.module,
            mediaCommon,
            mediaVolumes,
            lightsResource,
            lightIncoming,
            lightVisibilityReady,
            lightTransmissionReady,
            R.ambient,
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
    requires: [WORKGROUP_SIZE.module, mediaCommon, R.historyCurrent, R.scatterOut],
});

/** A luz ambiente na grade grossa (antes da injeção). */
export const froxelAmbient = wgslModule({
    name: 'media_froxel_ambient',
    source: froxelAmbientSource,
    requires: [WORKGROUP_SIZE.module, mediaCommon, sceneAmbientReady, R.ambientOut],
});

const injects = new Map<GPUTextureFormat, WgslModule>();

/** A injeção que escreve o histórico no formato dado (o `format` do canal; criada uma vez por formato). */
export function froxelInjectFor(format: GPUTextureFormat): WgslModule {
    let made = injects.get(format);
    if (made === undefined) injects.set(format, (made = inject(format)));
    return made;
}

/** A injeção na precisão padrão (`half`). */
export const froxelInject = froxelInjectFor('rgba16float');
