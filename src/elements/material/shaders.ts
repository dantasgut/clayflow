import { wgslModule, type WgslModule } from '../../scene/shaders/WgslModule';
import { wgslResource } from '../../scene/shaders/WgslResource';
import type { BindablePoint } from '../../scene/shaders/bindPoints';
import { NONE } from '../../scene/shaders/engineConstants';
import { sharedConstant } from '../../scene/shaders/SharedConstant';
import {
    sceneBackgroundReady,
    sceneEnvironmentReady,
    sceneLightingReady,
} from '../scene/points/lighting';
import { sceneFogReady } from '../scene/points/media';
import { closure, closureEval } from './pbr/shaders';
import {
    camerasResource,
    instancesResource,
    renderablesResource,
    worldsResource,
} from '../scene/resources';
import {
    diffuseMaterialsResource,
    forwardFrameResource,
    particleDrawResource,
    particleFrameResource,
    particlePoolResource,
    pointSpriteMaterialsResource,
    pointVerticesResource,
    standardMaterialsResource,
    surfaceDiffReadResource,
    wireEdgesResource,
    wireframeMaterialsResource,
    wireVerticesResource,
} from './renderResources';
import { bsdf, camera } from '../gpu/shaders/math';
import { cameraPointTypes } from '../scene/flows/shaders';
import { forwardMaterialReady, materialPointTypes } from './point/shaders';
import forwardSource from '../gpu/wgsl/forward.wgsl?raw';
import forwardCameraReadySource from '../gpu/wgsl/forward_camera_ready.wgsl?raw';
import forwardCameraFnSource from '../gpu/wgsl/forward_camera_fn.wgsl?raw';
import particleSpriteSource from '../gpu/wgsl/particle_sprite.wgsl?raw';
import pointSpriteSource from '../gpu/wgsl/point_sprite.wgsl?raw';
import diffuseSpriteSource from '../gpu/wgsl/diffuse/diffuse_sprite.wgsl?raw';
import wireSource from '../gpu/wgsl/wire.wgsl?raw';
import forwardTransmissionSource from '../gpu/wgsl/forward_transmission.wgsl?raw';
import forwardTransmissionRequestSource from '../gpu/wgsl/forward_transmission_request.wgsl?raw';
import refractionTraceSource from '../gpu/wgsl/refraction_trace.wgsl?raw';
import refractionCodecSource from '../gpu/wgsl/refraction_request.wgsl?raw';
import refractionShadeSource from '../gpu/wgsl/refraction_shade.wgsl?raw';
import refractionShadeMainSource from '../gpu/wgsl/refraction_shade_main.wgsl?raw';
import refractionFootprintSource from '../gpu/wgsl/refraction_footprint.wgsl?raw';
import refractionSamplesSource from '../gpu/wgsl/refraction_samples.wgsl?raw';
import refractionResolveSource from '../gpu/wgsl/refraction_resolve.wgsl?raw';
import refractionResolveMarksSource from '../gpu/wgsl/refraction_resolve_marks.wgsl?raw';
import refractionMarksSource from '../gpu/wgsl/refraction_marks.wgsl?raw';
import refractionMarksReadSource from '../gpu/wgsl/refraction_marks_read.wgsl?raw';
import refractionCopySource from '../gpu/wgsl/refraction_copy.wgsl?raw';
import refractionTraceMainSource from '../gpu/wgsl/refraction_trace_main.wgsl?raw';
import refractionTracePixelSource from '../gpu/wgsl/refraction_trace_pixel.wgsl?raw';
import refractionTraceExtraSource from '../gpu/wgsl/refraction_trace_extra.wgsl?raw';
import refractionBlurSource from '../gpu/wgsl/refraction_blur.wgsl?raw';
import refractionBlurHSource from '../gpu/wgsl/refraction_blur_h.wgsl?raw';
import refractionBlurVSource from '../gpu/wgsl/refraction_blur_v.wgsl?raw';
import { rayHit, rayScene } from '../raytrace/shaders';
import { rayVolumeEnterReady, rayVolumeExitReady, rayVolumeMediumReady } from '../raytrace/points';
import { RefractionFrameSchema, RefractionSchema } from './Refraction';
import forwardBackgroundSource from '../gpu/wgsl/forward_background.wgsl?raw';
import { Camera } from '../scene/Camera';
import { Transform } from '../scene/Transform';
import { RenderableSchema, RenderInstanceSchema } from '../scene/Renderable';
import { ForwardFrameParamsSchema, ParticleDrawParamsSchema } from './forwardSchemas';
import { SurfaceDiffSchema } from '../geometry/SurfaceSchemas';
import { StandardMaterialSchema } from './StandardMaterialSchema';
import { PointSpriteMaterialSchema } from './PointSpriteMaterialSchema';
import { DiffuseMaterialSchema } from './DiffuseMaterialSchema';
import { WireframeMaterialSchema } from './WireframeMaterialSchema';

/** Projeção do forward pronta (spec 009): `camera_clip` = `viewProjection · mundo`. */
export const forwardCameraReady = wgslModule({
    name: 'forward_camera_ready',
    source: forwardCameraReadySource,
    requires: [camerasResource],
});

/**
 * Lugar da projeção no desenho forward (spec 009): `fn camera_clip(slot: u32, world: vec4f) -> vec4f`. A câmera ativa
 * com `camera_project` troca o pronto pelo adaptador da função (`forwardCameraAdapter`).
 */
export const forwardCameraClip: BindablePoint = { name: 'camera_clip', ready: forwardCameraReady };

const cameraAdapters = new WeakMap<WgslModule, WgslModule>();

/**
 * Adaptador da projeção de ponto de uma função `camera` (spec 009): `forward_camera_fn.wgsl` sobre o módulo da função
 * — projeta `camera_project(vista · mundo, parâmetros da câmera ativa)`, com o registro da função lido no pool da forma
 * dela (o carregador e o recurso vêm com o módulo da função, spec 031). Memorizado por módulo da função.
 */
export function forwardCameraAdapter(fnModule: WgslModule): WgslModule {
    let adapter = cameraAdapters.get(fnModule);
    if (adapter !== undefined) return adapter;
    adapter = wgslModule({
        name: 'forward_camera_fn',
        source: forwardCameraFnSource,
        requires: [cameraPointTypes, camera, fnModule, camerasResource, forwardFrameResource],
        structs: [Camera.schema],
    });
    cameraAdapters.set(fnModule, adapter);
    return adapter;
}

/** Shader do desenho forward (vértice + fragmento), usado pelos materiais padrão. */
export const forward = wgslModule({
    name: 'forward',
    source: forwardSource,
    requires: [
        bsdf,
        NONE.module,
        forwardCameraReady,
        materialPointTypes,
        closure,
        closureEval,
        forwardMaterialReady,
        sceneLightingReady,
        sceneFogReady,
        camerasResource,
        worldsResource,
        renderablesResource,
        instancesResource,
        surfaceDiffReadResource,
        standardMaterialsResource,
        forwardFrameResource,
    ],
    structs: [
        Camera.matricesSchema,
        Transform.worldSchema,
        RenderableSchema,
        RenderInstanceSchema,
        StandardMaterialSchema,
        ForwardFrameParamsSchema,
        SurfaceDiffSchema,
    ],
});

/**
 * Fundo da cena (spec 033): triângulo de tela cheia no plano distante com a cor do ponto de cena `scene_background`
 * (o céu físico) pela direção de cada pixel da câmera ativa. O forward o desenha depois dos opacos, só com contribuinte.
 */
export const forwardBackground = wgslModule({
    name: 'forward_background',
    source: forwardBackgroundSource,
    requires: [sceneBackgroundReady, sceneFogReady, camerasResource, forwardFrameResource],
    structs: [Camera.matricesSchema, ForwardFrameParamsSchema],
});

/**
 * Sprites de partículas (spec 008): quad por partícula com a posição lida do pool do corpo pelo índice da instância,
 * esfera impostora iluminada pelo ponto de cena `scene_lighting` (spec 011). Usado pelo estágio de desenho de corpos de
 * partículas.
 */
export const particleSprite = wgslModule({
    name: 'particle_sprite',
    source: particleSpriteSource,
    requires: [
        materialPointTypes,
        closure,
        sceneLightingReady,
        sceneFogReady,
        camerasResource,
        particleFrameResource,
        particlePoolResource,
        pointSpriteMaterialsResource,
        particleDrawResource,
    ],
    structs: [Camera.matricesSchema, PointSpriteMaterialSchema, ParticleDrawParamsSchema],
});

/**
 * Sprites nos vértices de uma geometria (spec 008): o desenho forward de `PointSpriteMaterial` — quad por vértice com a
 * posição lida do vertex buffer da geometria como storage, entidade pela instância (registro `Renderable`).
 */
export const pointSprite = wgslModule({
    name: 'point_sprite',
    source: pointSpriteSource,
    requires: [
        materialPointTypes,
        closure,
        sceneLightingReady,
        sceneFogReady,
        camerasResource,
        worldsResource,
        renderablesResource,
        instancesResource,
        pointSpriteMaterialsResource,
        forwardFrameResource,
        pointVerticesResource,
    ],
    structs: [
        Camera.matricesSchema,
        Transform.worldSchema,
        RenderableSchema,
        RenderInstanceSchema,
        PointSpriteMaterialSchema,
        ForwardFrameParamsSchema,
    ],
});

/** Partículas secundárias de um fluido (spec 010): gotículas, espuma e bolhas sobre a nuvem de pontos. */
export const diffuseSprite = wgslModule({
    name: 'diffuse_sprite',
    source: diffuseSpriteSource,
    requires: [
        materialPointTypes,
        closure,
        sceneLightingReady,
        sceneFogReady,
        camerasResource,
        worldsResource,
        renderablesResource,
        instancesResource,
        diffuseMaterialsResource,
        forwardFrameResource,
        pointVerticesResource,
    ],
    structs: [
        Camera.matricesSchema,
        Transform.worldSchema,
        RenderableSchema,
        RenderInstanceSchema,
        DiffuseMaterialSchema,
        ForwardFrameParamsSchema,
    ],
});

/**
 * Arame com espessura (spec 008): as arestas da geometria (`wireEdges`, espaço de objeto) viram quads de `lineWidth`
 * pixels na tela, com borda suavizada — o desenho de `WireframeMaterial`.
 */
export const wire = wgslModule({
    name: 'wire',
    source: wireSource,
    requires: [
        camerasResource,
        worldsResource,
        renderablesResource,
        instancesResource,
        wireframeMaterialsResource,
        forwardFrameResource,
        wireVerticesResource,
        wireEdgesResource,
    ],
    structs: [
        Camera.matricesSchema,
        Transform.worldSchema,
        RenderableSchema,
        RenderInstanceSchema,
        WireframeMaterialSchema,
        ForwardFrameParamsSchema,
    ],
});

/**
 * Amostras extras da refração por pixel marcado (além da do centro); as camadas de `refraction_extra`. Três: no
 * antisserrilhado, três pontos dentro do pixel; na dispersão, um raio por canal (vermelho, verde, azul).
 */
const REFRACTION_EXTRA = sharedConstant('REFRACTION_EXTRA', 3, 'u32');

/**
 * Rodadas das amostras extras da refração por traçado: cada uma processa as entradas da lista dos marcados que cabem
 * nas texturas do caminho delas (um terço dos pixels da tela); quatro cobrem a tela inteira marcada.
 */
export const REFRACTION_ROUNDS = 4;

/** Codificação do pedido de refração e do acerto traçado (spec 034). */
export const refractionCodec = wgslModule({
    name: 'refraction_codec',
    source: refractionCodecSource,
    structs: [Camera.matricesSchema],
});

/** Câmera ativa e tempo do traçado (uniform privado de quem traça, spec 034). */
export const refractionFrameResource = wgslResource({
    name: 'refraction_frame',
    binding: { uniform: true },
    type: { schema: RefractionFrameSchema },
    frequency: 'frame',
    provider: 'private',
});

/** Parâmetros da refração (resolver `Refraction.params`, spec 034). */
export const refractionParamsResource = wgslResource({
    name: 'refraction',
    binding: { uniform: true },
    type: { schema: RefractionSchema },
    frequency: 'frame',
    provider: { consumer: 'Refraction.params' },
});

/** Recursos do passe de transmissivos (spec 011, R6), privados do estágio que o grava. */
export const transmissionResources = {
    /** Cópia da cena com mips (o que está atrás, em HDR). */
    sceneCopy: wgslResource({
        name: 'scene_copy',
        binding: { texture: { sample: 'f32' } },
        frequency: 'frame',
        provider: 'private',
    }),
    /** Amostrador linear com mips da cópia. */
    sampler: wgslResource({
        name: 'scene_copy_sampler',
        binding: { sampler: 'filtering' },
        frequency: 'frame',
        provider: 'private',
    }),
    /** Profundidade dos opacos (sem amostras), para a camada de trás ficar à frente deles. */
    sceneDepth: wgslResource({
        name: 'scene_depth',
        binding: { texture: { sample: 'depth' } },
        frequency: 'frame',
        provider: 'private',
    }),
    /** Profundidade dos opacos com amostras (MSAA): a amostra 0. */
    sceneDepthMs: wgslResource({
        name: 'scene_depth',
        binding: { texture: { sample: 'depth', multisampled: true } },
        frequency: 'frame',
        provider: 'private',
    }),
    /** Pedido de refração por pixel (spec 034): normal, IOR e Abbe, rugosidade, absorção, peso. */
    request: wgslResource({
        name: 'refraction_request',
        binding: { texture: { sample: 'u32' } },
        frequency: 'frame',
        provider: 'private',
    }),
    /** Distância da câmera ao ponto de cada pedido (o traçado reconstrói o ponto). */
    distance: wgslResource({
        name: 'refraction_distance',
        binding: { texture: { sample: 'f32' } },
        frequency: 'frame',
        provider: 'private',
    }),
    /** Radiância transmitida traçada por pixel (rgb) e a distância à superfície vista (a), lida pela composição. */
    radiance: wgslResource({
        name: 'refraction_radiance',
        binding: { texture: { sample: 'f32' } },
        frequency: 'frame',
        provider: 'private',
    }),
    /** A mesma radiância, escrita pelo traçado e pela passada vertical do desfoque. */
    radianceOut: wgslResource({
        name: 'refraction_radiance',
        binding: { storageTexture: { format: 'rgba16float', access: 'write' } },
        frequency: 'frame',
        provider: 'private',
    }),
    /** O que não depende das luzes (rgb) e a distância à primeira superfície (a), do primeiro kernel do traçado. */
    partialOut: wgslResource({
        name: 'refraction_partial',
        binding: { storageTexture: { format: 'rgba16float', access: 'write' } },
        frequency: 'frame',
        provider: 'private',
    }),
    partialIn: wgslResource({
        name: 'refraction_partial',
        binding: { texture: { sample: 'f32' } },
        frequency: 'frame',
        provider: 'private',
    }),
    /** A superfície vista pelo raio: ponto e se há superfície a iluminar. */
    hitOut: wgslResource({
        name: 'refraction_hit',
        binding: { storageTexture: { format: 'rgba32float', access: 'write' } },
        frequency: 'frame',
        provider: 'private',
    }),
    hitIn: wgslResource({
        name: 'refraction_hit',
        binding: { texture: { sample: 'f32' } },
        frequency: 'frame',
        provider: 'private',
    }),
    /** Normal, instância, uv e a direção de onde se vê a superfície. */
    hitInfoOut: wgslResource({
        name: 'refraction_hit_info',
        binding: { storageTexture: { format: 'rgba32uint', access: 'write' } },
        frequency: 'frame',
        provider: 'private',
    }),
    hitInfoIn: wgslResource({
        name: 'refraction_hit_info',
        binding: { texture: { sample: 'u32' } },
        frequency: 'frame',
        provider: 'private',
    }),
    /** O quanto chega da superfície vista (rgb). */
    throughputOut: wgslResource({
        name: 'refraction_throughput',
        binding: { storageTexture: { format: 'rgba16float', access: 'write' } },
        frequency: 'frame',
        provider: 'private',
    }),
    throughputIn: wgslResource({
        name: 'refraction_throughput',
        binding: { texture: { sample: 'f32' } },
        frequency: 'frame',
        provider: 'private',
    }),
    /** A amostra do centro de cada pixel (o acumulador): escrita pela luz, lida pela medida e pela média. */
    accumOut: wgslResource({
        name: 'refraction_accum_out',
        binding: { storageTexture: { format: 'rgba16float', access: 'write' } },
        frequency: 'frame',
        provider: 'private',
    }),
    accumIn: wgslResource({
        name: 'refraction_accum_in',
        binding: { texture: { sample: 'f32' } },
        frequency: 'frame',
        provider: 'private',
    }),
    /** Argumento do despacho indireto das amostras extras (palavras 0–2) e o contador dos marcados (3). */
    marks: wgslResource({
        name: 'refraction_marks',
        binding: { storage: 'read_write' },
        type: { wgsl: 'atomic<u32>', array: true },
        frequency: 'frame',
        provider: 'private',
    }),
    /** A lista dos pixels marcados (coordenadas empacotadas) e a contagem. */
    markListOut: wgslResource({
        name: 'refraction_mark_list_out',
        binding: { storageTexture: { format: 'r32uint', access: 'write', dimension: '2d_array' } },
        frequency: 'frame',
        provider: 'private',
    }),
    markList: wgslResource({
        name: 'refraction_mark_list',
        binding: { texture: { sample: 'u32', dimension: '2d_array' } },
        frequency: 'frame',
        provider: 'private',
    }),
    markCountOut: wgslResource({
        name: 'refraction_mark_count_out',
        binding: { storageTexture: { format: 'r32uint', access: 'write' } },
        frequency: 'frame',
        provider: 'private',
    }),
    markCount: wgslResource({
        name: 'refraction_mark_count',
        binding: { texture: { sample: 'u32' } },
        frequency: 'frame',
        provider: 'private',
    }),
    /** O caminho das amostras extras (um texel por par pixel × amostra da lista): escrita e leitura. */
    aaPartialOut: wgslResource({
        name: 'refraction_aa_partial_out',
        binding: { storageTexture: { format: 'rgba16float', access: 'write' } },
        frequency: 'frame',
        provider: 'private',
    }),
    aaPartial: wgslResource({
        name: 'refraction_aa_partial',
        binding: { texture: { sample: 'f32' } },
        frequency: 'frame',
        provider: 'private',
    }),
    aaHitOut: wgslResource({
        name: 'refraction_aa_hit_out',
        binding: { storageTexture: { format: 'rgba32float', access: 'write' } },
        frequency: 'frame',
        provider: 'private',
    }),
    aaHit: wgslResource({
        name: 'refraction_aa_hit',
        binding: { texture: { sample: 'f32' } },
        frequency: 'frame',
        provider: 'private',
    }),
    aaInfoOut: wgslResource({
        name: 'refraction_aa_info_out',
        binding: { storageTexture: { format: 'rgba32uint', access: 'write' } },
        frequency: 'frame',
        provider: 'private',
    }),
    aaInfo: wgslResource({
        name: 'refraction_aa_info',
        binding: { texture: { sample: 'u32' } },
        frequency: 'frame',
        provider: 'private',
    }),
    aaThroughputOut: wgslResource({
        name: 'refraction_aa_throughput_out',
        binding: { storageTexture: { format: 'rgba16float', access: 'write' } },
        frequency: 'frame',
        provider: 'private',
    }),
    aaThroughput: wgslResource({
        name: 'refraction_aa_throughput',
        binding: { texture: { sample: 'f32' } },
        frequency: 'frame',
        provider: 'private',
    }),
    /** A radiância de cada par (pixel marcado, amostra extra): escrita pela luz das extras, lida pela média. */
    aaRadianceOut: wgslResource({
        name: 'refraction_aa_radiance_out',
        binding: { storageTexture: { format: 'rgba16float', access: 'write' } },
        frequency: 'frame',
        provider: 'private',
    }),
    aaRadiance: wgslResource({
        name: 'refraction_aa_radiance',
        binding: { texture: { sample: 'f32' } },
        frequency: 'frame',
        provider: 'private',
    }),
    /** Intermediário do desfoque da rugosidade, escrito pela passada horizontal. */
    blurOut: wgslResource({
        name: 'refraction_blur_out',
        binding: { storageTexture: { format: 'rgba16float', access: 'write' } },
        frequency: 'frame',
        provider: 'private',
    }),
    /** O intermediário lido pela passada vertical. */
    blurIn: wgslResource({
        name: 'refraction_blur_in',
        binding: { texture: { sample: 'f32' } },
        frequency: 'frame',
        provider: 'private',
    }),
} as const;

/**
 * Pedidos de refração (spec 034, R2): o vértice do forward e o fragmento das faces da frente dos transmissivos, que grava
 * o pedido do pixel para o traçado.
 */
export const forwardTransmissionRequest = {
    /** Alvos sem amostras. */
    single: requestModule(false),
    /** Profundidade da cena com MSAA. */
    multisampled: requestModule(true),
} as const;

function requestModule(multisampled: boolean): WgslModule {
    return wgslModule({
        name: multisampled ? 'forward_transmission_request_ms' : 'forward_transmission_request',
        source: forwardTransmissionRequestSource,
        requires: [
            forward,
            closureEval,
            refractionCodec,
            multisampled ? transmissionResources.sceneDepthMs : transmissionResources.sceneDepth,
        ],
    });
}

/** A cópia da cena lida lisa (bicúbica) no traçado da refração, e a profundidade de vista de uma NDC (spec 034). */
const refractionCopy = wgslModule({
    name: 'refraction_copy',
    source: refractionCopySource,
    requires: [transmissionResources.sceneCopy, transmissionResources.sampler],
    structs: [Camera.matricesSchema],
});

/**
 * Núcleo da refração pela estrutura de raios (spec 034, R1–R4): `refraction_trace_ray` segue o raio refratado de uma
 * entrada — interfaces encadeadas (superfícies e a água), reflexão interna total, absorção, dispersão por canal — e
 * calcula o material e a luz da superfície vista. Usado pelo vidro (os pedidos do desenho) e pela água.
 */
export const refractionCore = wgslModule({
    name: 'refraction_core',
    source: refractionTraceSource,
    requires: [
        closure,
        closureEval,
        rayScene,
        rayHit,
        rayVolumeEnterReady,
        rayVolumeExitReady,
        rayVolumeMediumReady,
        sceneBackgroundReady,
        sceneEnvironmentReady,
        refractionParamsResource,
        refractionFrameResource,
        refractionCopy,
    ],
    structs: [Camera.matricesSchema],
});

/** A lista dos pixels marcados pelo antisserrilhado: a escrita (a medida e o argumento indireto) e a leitura. */
const refractionMarks = wgslModule({
    name: 'refraction_marks_write',
    source: refractionMarksSource,
    requires: [
        REFRACTION_EXTRA.module,
        transmissionResources.marks,
        transmissionResources.markListOut,
        transmissionResources.markCountOut,
    ],
});

const refractionMarksRead = wgslModule({
    name: 'refraction_marks_read',
    source: refractionMarksReadSource,
    requires: [transmissionResources.markList, transmissionResources.markCount],
});

/** O caminho de uma amostra de um pedido (a do centro e as extras). */
const refractionTracePixel = wgslModule({
    name: 'refraction_trace_pixel',
    source: refractionTracePixelSource,
    requires: [
        refractionCore,
        refractionCodec,
        camerasResource,
        refractionFrameResource,
        transmissionResources.request,
        transmissionResources.distance,
    ],
    structs: [Camera.matricesSchema],
});

/** A luz da superfície vista por uma amostra (função dos valores gravados pelo caminho). */
const refractionShade = wgslModule({
    name: 'refraction_shade',
    source: refractionShadeSource,
    requires: [
        closure,
        closureEval,
        rayHit,
        sceneLightingReady,
        refractionCodec,
        refractionFrameResource,
    ],
});

/**
 * O traçado dos pedidos (do vidro e da água) em dois kernels por amostra: o caminho (a geometria, os volumes, o que não
 * depende das luzes) e a luz da superfície vista (`scene_lighting`) — separados porque as luzes, as sombras e a luz
 * rebatida pedem mais buffers do que um kernel comporta junto com a estrutura e os volumes —, e o antisserrilhado: a
 * medida de onde a imagem serrilha (e a lista), as amostras extras dos pixels marcados (o caminho e a luz, um fio por
 * par, um despacho cada) e a média.
 */
export const refractionKernels = {
    /** O caminho da amostra do centro (todos os pixels). */
    trace: wgslModule({
        name: 'refraction_trace',
        source: refractionTraceMainSource,
        requires: [
            refractionTracePixel,
            transmissionResources.partialOut,
            transmissionResources.hitOut,
            transmissionResources.hitInfoOut,
            transmissionResources.throughputOut,
        ],
    }),
    /** A luz da amostra do centro (no acumulador). */
    shade: wgslModule({
        name: 'refraction_shade_main',
        source: refractionShadeMainSource,
        requires: [
            refractionShade,
            transmissionResources.partialIn,
            transmissionResources.hitIn,
            transmissionResources.hitInfoIn,
            transmissionResources.throughputIn,
            transmissionResources.accumOut,
        ],
    }),
    /** A medida de onde a imagem refratada serrilha e a lista dos marcados. */
    footprint: wgslModule({
        name: 'refraction_footprint',
        source: refractionFootprintSource,
        requires: [
            refractionMarks,
            refractionParamsResource,
            transmissionResources.hitIn,
            transmissionResources.accumIn,
            transmissionResources.throughputIn,
        ],
    }),
    /** O argumento indireto das amostras extras e a contagem dos marcados, e o avanço das rodadas (um fio cada). */
    marksArgs: refractionMarks,
    /** O caminho das amostras extras (um fio por par pixel marcado × amostra). */
    traceExtra: wgslModule({
        name: 'refraction_trace_extra',
        source: refractionTraceExtraSource,
        requires: [
            refractionTracePixel,
            refractionMarksRead,
            REFRACTION_EXTRA.module,
            transmissionResources.aaPartialOut,
            transmissionResources.aaHitOut,
            transmissionResources.aaInfoOut,
            transmissionResources.aaThroughputOut,
        ],
    }),
    /** A luz das amostras extras (na camada de cada uma). */
    sample: wgslModule({
        name: 'refraction_sample',
        source: refractionSamplesSource,
        requires: [
            refractionShade,
            refractionMarksRead,
            REFRACTION_EXTRA.module,
            transmissionResources.aaPartial,
            transmissionResources.aaHit,
            transmissionResources.aaInfo,
            transmissionResources.aaThroughput,
            transmissionResources.aaRadianceOut,
        ],
    }),
    /** A amostra do centro como a radiância transmitida de cada pixel com pedido. */
    resolve: wgslModule({
        name: 'refraction_resolve',
        source: refractionResolveSource,
        requires: [
            transmissionResources.hitIn,
            transmissionResources.accumIn,
            transmissionResources.radianceOut,
        ],
    }),
    /** A média dos pixels marcados (um fio por entrada da lista), sobre a do centro. */
    resolveMarks: wgslModule({
        name: 'refraction_resolve_marks',
        source: refractionResolveMarksSource,
        requires: [
            refractionMarksRead,
            REFRACTION_EXTRA.module,
            transmissionResources.accumIn,
            transmissionResources.aaRadiance,
            transmissionResources.radianceOut,
        ],
    }),
} as const;

const refractionBlur = wgslModule({
    name: 'refraction_blur',
    source: refractionBlurSource,
    requires: [
        refractionCodec,
        camerasResource,
        refractionFrameResource,
        refractionParamsResource,
        transmissionResources.request,
        transmissionResources.distance,
    ],
    structs: [Camera.matricesSchema],
});

/** Desfoque da rugosidade da transmissão (spec 034, R5): as passadas horizontal e vertical. */
export const refractionBlurPasses = {
    horizontal: wgslModule({
        name: 'refraction_blur_h',
        source: refractionBlurHSource,
        requires: [refractionBlur, transmissionResources.radiance, transmissionResources.blurOut],
    }),
    vertical: wgslModule({
        name: 'refraction_blur_v',
        source: refractionBlurVSource,
        requires: [refractionBlur, transmissionResources.blurIn, transmissionResources.radianceOut],
    }),
} as const;

/**
 * Composição dos transmissivos (spec 011, R6; spec 034): o vértice do forward e o fragmento das faces da frente — o reflexo,
 * a radiância traçada no pixel sob o Fresnel e o peso do lobo, a opacidade e a névoa.
 */
export const forwardTransmission = {
    /** Alvos sem amostras. */
    single: transmissionModule(false),
    /** Alvos com MSAA. */
    multisampled: transmissionModule(true),
} as const;

function transmissionModule(multisampled: boolean): WgslModule {
    return wgslModule({
        name: multisampled ? 'forward_transmission_ms' : 'forward_transmission',
        source: forwardTransmissionSource,
        requires: [
            forward,
            closureEval,
            refractionCodec,
            transmissionResources.sceneCopy,
            transmissionResources.sampler,
            transmissionResources.request,
            transmissionResources.radiance,
        ],
    });
}
