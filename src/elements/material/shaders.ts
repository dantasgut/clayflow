import { wgslModule, type WgslModule } from '../../scene/shaders/WgslModule';
import type { BindablePoint } from '../../scene/shaders/bindPoints';
import { NONE } from '../../scene/shaders/engineConstants';
import { DEFAULT_LIGHT_DIRECTION } from '../gpu/shaders/constants';
import {
    lightTransmissionReady,
    lightVisibilityReady,
    sceneLightDirectionReady,
} from '../scene/points/lighting';
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
    particleLightsResource,
    particlePoolResource,
    pointSpriteMaterialsResource,
    pointVerticesResource,
    standardMaterialsResource,
    surfaceDiffReadResource,
    wireEdgesResource,
    wireframeMaterialsResource,
    wireVerticesResource,
} from './renderResources';
import { brdf, camera } from '../gpu/shaders/math';
import { cameraPointTypes } from '../scene/flows/shaders';
import { forwardMaterialReady, materialPointTypes } from './point/shaders';
import forwardSource from '../gpu/wgsl/forward.wgsl?raw';
import forwardCameraReadySource from '../gpu/wgsl/forward_camera_ready.wgsl?raw';
import forwardCameraFnSource from '../gpu/wgsl/forward_camera_fn.wgsl?raw';
import particleSpriteSource from '../gpu/wgsl/particle_sprite.wgsl?raw';
import pointSpriteSource from '../gpu/wgsl/point_sprite.wgsl?raw';
import diffuseSpriteSource from '../gpu/wgsl/diffuse/diffuse_sprite.wgsl?raw';
import wireSource from '../gpu/wgsl/wire.wgsl?raw';
import { Camera } from '../scene/Camera';
import { Transform } from '../scene/Transform';
import { RenderableSchema, RenderInstanceSchema } from '../scene/Renderable';
import { ForwardFrameParamsSchema, ParticleDrawParamsSchema } from './forwardSchemas';
import { Light } from '../scene/Light';
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
        brdf,
        NONE.module,
        forwardCameraReady,
        materialPointTypes,
        forwardMaterialReady,
        sceneLightDirectionReady,
        lightVisibilityReady,
        lightTransmissionReady,
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
 * Sprites de partículas (spec 008): quad por partícula com a posição lida do pool do corpo pelo índice da instância,
 * esfera impostora iluminada pela luz do pool. Usado pelo estágio de desenho de corpos de partículas.
 */
export const particleSprite = wgslModule({
    name: 'particle_sprite',
    source: particleSpriteSource,
    requires: [
        brdf,
        NONE.module,
        DEFAULT_LIGHT_DIRECTION.module,
        camerasResource,
        particleLightsResource,
        particleFrameResource,
        particlePoolResource,
        pointSpriteMaterialsResource,
        particleDrawResource,
    ],
    structs: [
        Camera.matricesSchema,
        Light.schema,
        PointSpriteMaterialSchema,
        ParticleDrawParamsSchema,
    ],
});

/**
 * Sprites nos vértices de uma geometria (spec 008): o desenho forward de `PointSpriteMaterial` — quad por vértice com a
 * posição lida do vertex buffer da geometria como storage, entidade pela instância (registro `Renderable`).
 */
export const pointSprite = wgslModule({
    name: 'point_sprite',
    source: pointSpriteSource,
    requires: [
        brdf,
        sceneLightDirectionReady,
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
        brdf,
        sceneLightDirectionReady,
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
