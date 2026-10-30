import { wgslModule, type WgslModule } from '../../../scene/shaders/WgslModule';
import {
    wgslResource,
    type WgslResource,
    type WgslResourceType,
} from '../../../scene/shaders/WgslResource';
import { NONE, WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import refractionQueueSource from '../../gpu/wgsl/refraction/refraction_queue.wgsl?raw';
import refractionInterfaceSource from '../../gpu/wgsl/refraction/refraction_interface.wgsl?raw';
import refractionMediaSource from '../../gpu/wgsl/refraction/refraction_media.wgsl?raw';
import refractionCameraSource from '../../gpu/wgsl/refraction/refraction_camera.wgsl?raw';
import refractionPathSource from '../../gpu/wgsl/refraction/refraction_path.wgsl?raw';
import refractionSceneSource from '../../gpu/wgsl/refraction/refraction_scene.wgsl?raw';
import refractionVolumeRequestSource from '../../gpu/wgsl/refraction/refraction_volume_request.wgsl?raw';
import refractionVolumeMeshSource from '../../gpu/wgsl/refraction/refraction_volume_mesh.wgsl?raw';
import refractionBlockSource from '../../gpu/wgsl/refraction/refraction_block.wgsl?raw';
import { transmissionResources } from '../../material/shaders';
import refractionChainSource from '../../gpu/wgsl/refraction/refraction_chain.wgsl?raw';
import refractionChainArgsSource from '../../gpu/wgsl/refraction/refraction_chain_args.wgsl?raw';
import refractionGradientSource from '../../gpu/wgsl/refraction/refraction_gradient.wgsl?raw';
import refractionHistorySource from '../../gpu/wgsl/refraction/refraction_history.wgsl?raw';
import refractionDenoiseSourceSource from '../../gpu/wgsl/refraction/refraction_denoise_source.wgsl?raw';
import refractionCompositeSource from '../../gpu/wgsl/refraction/refraction_composite.wgsl?raw';
import refractionCompositeDenoisedSource from '../../gpu/wgsl/refraction/refraction_composite_denoised.wgsl?raw';
import refractionScreenSource from '../../gpu/wgsl/refraction/refraction_screen.wgsl?raw';
import refractionMotionSource from '../../gpu/wgsl/refraction/refraction_motion.wgsl?raw';
import {
    basis,
    bsdf,
    camera,
    color,
    constants,
    random,
    viewSpace,
    xformAffine,
} from '../../gpu/shaders/math';
import { temporalFilterResources } from '../temporal/shaders';
import { closure, closureEval } from '../../material/pbr/shaders';
import { rayDirect, rayHit, rayScene } from '../../raytrace/shaders';
import { rayWave } from '../../raytrace/wave/shaders';
import { fieldResources } from '../../fields/shaders';
import {
    RefractionBlockSchema,
    RefractionMediumSchema,
    RefractionChainSchema,
    RefractionSplitSchema,
    RefractionStackSchema,
} from './schemas';
import {
    rayVolumeBeginReady,
    rayVolumeHitReady,
    rayVolumeMaterial,
    rayVolumeSurfaceReady,
    rayVolumeTypes,
} from '../../raytrace/points';
import { cameraSpace } from '../../scene/flows/shaders';
import { sceneEnvironmentReady, sceneIndirectLightingReady } from '../../scene/points/lighting';
import { sceneFogReady } from '../../scene/points/media';
import {
    camerasResource,
    previousWorldsResource,
    renderablesResource,
    worldInversesResource,
} from '../../scene/resources';
import { RenderableSchema } from '../../scene/Renderable';
import {
    Refraction,
    REFRACTION_ALBEDO_FORMAT,
    REFRACTION_FRAME_COUNT,
    REFRACTION_HIT_FORMAT,
    REFRACTION_GRADIENT_FORMAT,
    REFRACTION_MAX_MEDIA,
    REFRACTION_QUEUE_FORMAT,
    REFRACTION_RADIANCE_FORMAT,
    REFRACTION_REQUEST_BACK_FACE,
    REFRACTION_REQUEST_VALID,
} from './Refraction';

// Módulos da refração traçada (spec 034, R1): o uniform do `Refraction` (resolver `Refraction.params`), os alvos dele
// ligados pelo `RefractionFlow` (privados do estágio) e os kernels da fila, dos meios da câmera e do traçado.

/** Parâmetros da refração (resolver `Refraction.params`). */
export const refractionParamsResource = wgslResource({
    name: 'refraction',
    binding: { uniform: true },
    type: { schema: Refraction.schema },
    frequency: 'frame',
    provider: { consumer: 'Refraction.params' },
});

const texture = (
    name: string,
    sample: 'u32' | 'f32' | 'depth' = 'u32',
): ReturnType<typeof wgslResource> =>
    wgslResource({
        name,
        binding: { texture: { sample } },
        frequency: 'frame',
        provider: 'private',
    });

const storageTexture = (name: string, format: GPUTextureFormat): ReturnType<typeof wgslResource> =>
    wgslResource({
        name,
        binding: { storageTexture: { format, access: 'write' } },
        frequency: 'frame',
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

/**
 * Recursos privados do estágio: o pedido por pixel, a fila (escrita na compactação, lida no traçado) e a contagem dela,
 * o estado do quadro (os meios da câmera e a contagem; escrito e lido), a radiância traçada, o ponto que o pixel mostra
 * e o gradiente temporal com os raios dele; e, de quem os lê, os mesmos como textura e a profundidade do pedido.
 */
export const refractionResources = Object.freeze({
    request: texture('refraction_request'),
    queueOut: storageTexture('refraction_queue_out', REFRACTION_QUEUE_FORMAT),
    queueIn: texture('refraction_queue_in'),
    queueCount: wgslResource({
        name: 'refraction_queue_count',
        binding: { storage: 'read_write' },
        type: { wgsl: 'atomic<u32>', array: true },
        frequency: 'frame',
        provider: 'private',
    }),
    frameOut: storageTexture('refraction_frame_out', 'rgba32uint'),
    frame: texture('refraction_frame'),
    radianceOut: storageTexture('refraction_radiance_out', REFRACTION_RADIANCE_FORMAT),
    radiance: texture('refraction_radiance', 'f32'),
    hitOut: storageTexture('refraction_hit_out', REFRACTION_HIT_FORMAT),
    hit: texture('refraction_hit', 'f32'),
    albedoOut: storageTexture('refraction_albedo_out', REFRACTION_ALBEDO_FORMAT),
    albedo: texture('refraction_albedo', 'f32'),
    gradientOut: storageTexture('refraction_gradient_out', REFRACTION_GRADIENT_FORMAT),
    gradient: texture('refraction_gradient', 'f32'),
    requestDepth: texture('refraction_request_depth', 'depth'),
    /** A refração com trabalho fixo por pixel (spec 039 refeita): as vagas de um bloco e o cabeçalho do quadro. */
    paths: priv('refraction_paths', 'read_write', { schema: RefractionChainSchema, array: true }),
    /** A dispersão adiada de cada vaga (o mesmo índice das vagas), à parte do estado lido em cada rodada. */
    splits: priv('refraction_splits', 'read_write', { schema: RefractionSplitSchema, array: true }),
    pathQueue: priv('refraction_path_queue', 'read_write', { wgsl: 'atomic<u32>', array: true }),
    /** Os argumentos do despacho indireto da rodada (grupos x, y, z). */
    pathArgs: priv('refraction_path_args', 'read_write', { wgsl: 'u32', array: true }),
    /** O registro de cada bloco 2×2 traçado no quadro (o representante), para a reconstrução. */
    blocks: priv('refraction_blocks', 'read_write', { schema: RefractionBlockSchema, array: true }),
    /** Por pixel: o quadro (+ 1; 0 = nenhum) e a distância do pedido do último valor exato dele. */
    stamps: priv('refraction_stamps', 'read_write', { wgsl: 'vec2u', array: true }),
});

const R = refractionResources;

/** A meia resolução da refração (spec 039 refeita): o representante de cada bloco 2×2 no quadro. */
const refractionBlock = wgslModule({
    name: 'refraction_block',
    source: refractionBlockSource,
    requires: [REFRACTION_REQUEST_VALID.module, refractionParamsResource, R.request],
});

/** Kernels da fila compacta dos pixels com pedido e da contagem no estado do quadro. */
export const refractionQueue = wgslModule({
    name: 'refraction_queue',
    source: refractionQueueSource,
    requires: [
        WORKGROUP_SIZE.module,
        REFRACTION_REQUEST_VALID.module,
        REFRACTION_FRAME_COUNT.module,
        refractionBlock,
        R.request,
        R.queueOut,
        R.queueCount,
        R.frameOut,
    ],
});

/** Interface dielétrica: Fresnel exato, microfaceta GGX pela distribuição visível, G1, reflexão e refração. */
export const refractionInterface = wgslModule({
    name: 'refraction_interface',
    source: refractionInterfaceSource,
    requires: [bsdf, basis, constants],
});

/** Pilha de meios (prioridade, índice por canal, absorção). */
export const refractionMedia = wgslModule({
    name: 'refraction_media',
    source: refractionMediaSource,
    requires: [NONE.module, closure, REFRACTION_MAX_MEDIA.module],
    structs: [RefractionMediumSchema, RefractionStackSchema],
});

/**
 * O acerto do raio da refração: a malha ou a superfície de um volume (os pontos `ray_volume_hit` e `ray_volume_surface`:
 * a água das partículas, T065e), com o fechamento e a marca de movimento de cada um.
 */
export const refractionScene = wgslModule({
    name: 'refraction_scene',
    source: refractionSceneSource,
    requires: [
        NONE.module,
        rayScene,
        rayHit,
        rayVolumeTypes,
        rayVolumeHitReady,
        rayVolumeSurfaceReady,
        rayVolumeMaterial,
        rayWave,
    ],
});

/** Os meios em que a câmera está, no estado do quadro. */
export const refractionCamera = wgslModule({
    name: 'refraction_camera',
    source: refractionCameraSource,
    requires: [
        NONE.module,
        REFRACTION_MAX_MEDIA.module,
        refractionParamsResource,
        refractionMedia,
        refractionScene,
        camerasResource,
        rayScene,
        rayHit,
        rayWave,
        R.frameOut,
    ],
});

/** Uma amostra do caminho traçado do raio de um pixel (determinística pelo estado aleatório). */
export const refractionPath = wgslModule({
    name: 'refraction_path',
    source: refractionPathSource,
    requires: [
        random,
        color,
        NONE.module,
        REFRACTION_MAX_MEDIA.module,
        refractionParamsResource,
        refractionInterface,
        refractionMedia,
        refractionScene,
        rayScene,
        rayHit,
        cameraSpace,
        rayDirect,
        closureEval,
        sceneEnvironmentReady,
        sceneIndirectLightingReady,
        R.frame,
    ],
});

/**
 * A refração com trabalho fixo por pixel (spec 039 refeita): as vagas de cada pixel da fila, as rodadas (o acerto de cada
 * vaga na onda e a continuação pelo fechamento avaliado fora) e o fechamento por pixel. Nenhuma função `material`.
 */
export const refractionChain = wgslModule({
    name: 'refraction_chain',
    source: refractionChainSource,
    requires: [
        WORKGROUP_SIZE.module,
        REFRACTION_REQUEST_VALID.module,
        R.request,
        refractionBlock,
        rayVolumeBeginReady,
        NONE.module,
        REFRACTION_FRAME_COUNT.module,
        refractionParamsResource,
        refractionPath,
        rayWave,
        R.queueIn,
        R.frame,
        R.radianceOut,
        R.hitOut,
        R.albedoOut,
        R.paths,
        R.splits,
        R.pathQueue,
        R.blocks,
        R.stamps,
    ],
});

/** Os argumentos do despacho indireto de cada rodada da cadeia, pelas vagas vivas da lista corrente. */
export const refractionChainArgs = wgslModule({
    name: 'refraction_chain_args',
    source: refractionChainArgsSource,
    requires: [WORKGROUP_SIZE.module, R.pathQueue, R.pathArgs],
});

/**
 * A marca de movimento do quadro anterior por pixel (spec 034, T044a), copiada do alfa do albedo antes do traçado.
 */
export const refractionGradient = wgslModule({
    name: 'refraction_gradient',
    source: refractionGradientSource,
    requires: [
        WORKGROUP_SIZE.module,
        REFRACTION_REQUEST_VALID.module,
        R.request,
        R.albedo,
        R.gradientOut,
    ],
});

/**
 * O que o histórico de um pixel com pedido precisa: onde estava o ponto mostrado, a largura do pixel nele e a mudança da
 * cena pelo gradiente temporal.
 */
export const refractionHistory = wgslModule({
    name: 'refraction_history',
    source: refractionHistorySource,
    requires: [
        xformAffine,
        cameraSpace,
        viewSpace,
        NONE.module,
        refractionParamsResource,
        camerasResource,
        renderablesResource,
        worldInversesResource,
        previousWorldsResource,
        R.hit,
        R.albedo,
        R.gradient,
    ],
    structs: [RenderableSchema],
});

/**
 * A refração como sinal do filtro de sinal traçado (a implementação do ponto `temporal_filter_source`): os pixels com
 * pedido, a radiância e, como guias, o ponto mostrado e o albedo dele.
 */
export const refractionDenoiseSource = wgslModule({
    name: 'refraction_denoise_source',
    source: refractionDenoiseSourceSource,
    requires: [
        REFRACTION_REQUEST_VALID.module,
        refractionHistory,
        refractionBlock,
        R.request,
        R.radiance,
        R.hit,
    ],
});

/** O triângulo de tela cheia dos passes da refração (`refraction_screen_vs`). */
export const refractionScreen = wgslModule({
    name: 'refraction_screen',
    source: refractionScreenSource,
    requires: [viewSpace],
});

/**
 * O pedido pelos volumes (T065f): o triângulo de tela cheia que marca no pedido a superfície de um volume à frente dos
 * opacos, ou todo pixel com a câmera dentro de um — sem e com amostras na profundidade dos opacos.
 */
export const refractionVolumeRequest = {
    single: volumeRequestModule(false),
    multisampled: volumeRequestModule(true),
} as const;

function volumeRequestModule(multisampled: boolean): WgslModule {
    return wgslModule({
        name: multisampled ? 'refraction_volume_request_ms' : 'refraction_volume_request',
        source: refractionVolumeRequestSource,
        requires: [
            NONE.module,
            REFRACTION_MAX_MEDIA.module,
            R.frame,
            refractionScreen,
            refractionParamsResource,
            camerasResource,
            cameraSpace,
            viewSpace,
            rayVolumeHitReady,
            REFRACTION_REQUEST_VALID.module,
            REFRACTION_REQUEST_BACK_FACE.module,
            multisampled ? transmissionResources.sceneDepthMs : transmissionResources.sceneDepth,
        ],
    });
}

/**
 * O pedido pela malha da superfície dos volumes (spec 039 refeita, D3): os triângulos que o campo extrai, nas duas faces
 * — sem e com amostras na profundidade dos opacos.
 */
export const refractionVolumeMesh = {
    single: volumeMeshModule(false),
    multisampled: volumeMeshModule(true),
} as const;

function volumeMeshModule(multisampled: boolean): WgslModule {
    return wgslModule({
        name: multisampled ? 'refraction_volume_mesh_ms' : 'refraction_volume_mesh',
        source: refractionVolumeMeshSource,
        requires: [
            refractionParamsResource,
            camerasResource,
            REFRACTION_REQUEST_VALID.module,
            REFRACTION_REQUEST_BACK_FACE.module,
            multisampled ? transmissionResources.sceneDepthMs : transmissionResources.sceneDepth,
            fieldResources.mesh,
        ],
    });
}

/** A composição do traçado nos alvos da cena: a cor e a profundidade dos pixels com pedido. */
export const refractionComposite = wgslModule({
    name: 'refraction_composite',
    source: refractionCompositeSource,
    requires: [
        refractionScreen,
        REFRACTION_REQUEST_VALID.module,
        refractionParamsResource,
        cameraSpace,
        sceneFogReady,
        R.request,
        R.radiance,
        R.requestDepth,
    ],
});

/** A composição com a cor do filtro do traçado (com o antisserrilhado temporal). */
export const refractionCompositeDenoised = wgslModule({
    name: 'refraction_composite_denoised',
    source: refractionCompositeDenoisedSource,
    requires: [
        refractionComposite,
        REFRACTION_REQUEST_VALID.module,
        R.request,
        temporalFilterResources.output,
    ],
});

/**
 * O movimento do que o pixel com pedido mostra (spec 034, T044a): o ponto que o traçado achou, levado do mundo deste
 * quadro ao do anterior pelas matrizes do objeto atingido, e projetado pelas duas câmeras; e se a cena mudou em volta
 * do pixel pelo gradiente temporal (a máscara reativa).
 */
export const refractionMotion = wgslModule({
    name: 'refraction_motion',
    source: refractionMotionSource,
    requires: [
        cameraSpace,
        refractionScreen,
        REFRACTION_REQUEST_VALID.module,
        refractionParamsResource,
        camera,
        camerasResource,
        refractionHistory,
        R.request,
        R.hit,
    ],
});
