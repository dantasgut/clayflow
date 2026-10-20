import { wgslModule, type WgslModule } from '../../scene/shaders/WgslModule';
import { wgslResource } from '../../scene/shaders/WgslResource';
import type { BindablePoint } from '../../scene/shaders/bindPoints';
import { NONE } from '../../scene/shaders/engineConstants';
import { sceneBackgroundReady, sceneLightingReady } from '../scene/points/lighting';
import { sceneFogReady } from '../scene/points/media';
import { closure, closureEval } from './pbr/shaders';
import {
    camerasResource,
    instancesResource,
    renderablesResource,
    worldsResource,
    previousWorldsResource,
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
        previousWorldsResource,
        renderablesResource,
        instancesResource,
        surfaceDiffReadResource,
        standardMaterialsResource,
        forwardFrameResource,
    ],
    structs: [
        Camera.matricesSchema,
        Transform.worldSchema,
        Transform.previousWorldSchema,
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
    /** Distância da câmera às faces de trás dos transmissivos (a espessura da camada da frente). */
    depth: wgslResource({
        name: 'transmission_depth',
        binding: { texture: { sample: 'f32' } },
        frequency: 'frame',
        provider: 'private',
    }),
} as const;

/**
 * Transmissivos em duas camadas (spec 011, R6): o vértice do forward e os fragmentos das faces de trás e da frente, que
 * refratam a cópia da cena com mips (Beer-Lambert, dispersão, parede fina, opacidade).
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
            transmissionResources.sceneCopy,
            transmissionResources.sampler,
            transmissionResources.depth,
            multisampled ? transmissionResources.sceneDepthMs : transmissionResources.sceneDepth,
        ],
    });
}
