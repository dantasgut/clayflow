import { wgslModule, type WgslModule } from '../../scene/shaders/WgslModule';
import { wgslResource } from '../../scene/shaders/WgslResource';
import type { BindablePoint } from '../../scene/shaders/bindPoints';
import { NONE } from '../../scene/shaders/engineConstants';
import {
    sceneBackgroundReady,
    sceneLightingReady,
    sceneTransmittedLightingReady,
} from '../scene/points/lighting';
import { sceneFogReady, sceneWetnessReady } from '../scene/points/media';
import { closure, closureEval, subsurface } from './pbr/shaders';
import {
    camerasResource,
    renderablesResource,
    worldsResource,
    previousWorldsResource,
} from '../scene/resources';
import {
    diffuseMaterialsResource,
    drawVisibleResource,
    forwardFrameResource,
    particleDrawResource,
    particleFrameResource,
    particleListResource,
    particlePoolResource,
    pointSpriteMaterialsResource,
    pointVerticesResource,
    pointPreviousVerticesResource,
    standardMaterialsResource,
    surfaceDiffReadResource,
    wireEdgesResource,
    wireframeMaterialsResource,
    wireVerticesResource,
} from './renderResources';
import {
    basis,
    bsdf,
    camera,
    color,
    constants,
    hashAddress,
    random,
    viewSpace,
} from '../gpu/shaders/math';
import { cameraSpace } from '../scene/flows/shaders';
import { cameraPointTypes } from '../scene/flows/shaders';
import { forwardMaterialReady, materialPointTypes } from './point/shaders';
import forwardSource from '../gpu/wgsl/forward.wgsl?raw';
import forwardCameraReadySource from '../gpu/wgsl/forward_camera_ready.wgsl?raw';
import forwardCameraFnSource from '../gpu/wgsl/forward_camera_fn.wgsl?raw';
import particleSpriteSource from '../gpu/wgsl/particle_sprite.wgsl?raw';
import pointSpriteSource from '../gpu/wgsl/point_sprite.wgsl?raw';
import diffuseSpriteSource from '../gpu/wgsl/diffuse/diffuse_sprite.wgsl?raw';
import wireSource from '../gpu/wgsl/wire.wgsl?raw';
import forwardRefractionRequestSource from '../gpu/wgsl/forward_refraction_request.wgsl?raw';
import forwardSubsurfaceIrradianceSource from '../gpu/wgsl/forward_subsurface_irradiance.wgsl?raw';
import forwardSubsurfaceGatherSource from '../gpu/wgsl/forward_subsurface_gather.wgsl?raw';
import forwardSubsurfaceApplySource from '../gpu/wgsl/forward_subsurface_apply.wgsl?raw';
import {
    REFRACTION_REQUEST_BACK_FACE,
    REFRACTION_REQUEST_VALID,
} from '../lighting/refraction/Refraction';
import forwardBackgroundSource from '../gpu/wgsl/forward_background.wgsl?raw';
import { Camera } from '../scene/Camera';
import { Transform } from '../scene/Transform';
import { RenderableSchema } from '../scene/Renderable';
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
        camera,
        color,
        bsdf,
        NONE.module,
        forwardCameraReady,
        materialPointTypes,
        closure,
        closureEval,
        forwardMaterialReady,
        sceneLightingReady,
        sceneFogReady,
        sceneWetnessReady,
        camerasResource,
        worldsResource,
        previousWorldsResource,
        renderablesResource,
        drawVisibleResource,
        surfaceDiffReadResource,
        standardMaterialsResource,
        forwardFrameResource,
    ],
    structs: [
        Camera.matricesSchema,
        Transform.worldSchema,
        Transform.previousWorldSchema,
        RenderableSchema,
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
    requires: [
        cameraSpace,
        viewSpace,
        sceneBackgroundReady,
        sceneFogReady,
        camerasResource,
        forwardFrameResource,
    ],
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
        camera,
        NONE.module,
        materialPointTypes,
        closure,
        sceneLightingReady,
        sceneFogReady,
        camerasResource,
        particleFrameResource,
        particlePoolResource,
        pointSpriteMaterialsResource,
        particleDrawResource,
        particleListResource,
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
        camera,
        materialPointTypes,
        closure,
        sceneLightingReady,
        sceneFogReady,
        camerasResource,
        worldsResource,
        renderablesResource,
        drawVisibleResource,
        pointSpriteMaterialsResource,
        forwardFrameResource,
        pointVerticesResource,
        previousWorldsResource,
        pointPreviousVerticesResource,
    ],
    structs: [
        Camera.matricesSchema,
        Transform.worldSchema,
        Transform.previousWorldSchema,
        RenderableSchema,
        PointSpriteMaterialSchema,
        ForwardFrameParamsSchema,
    ],
});

/** Partículas secundárias de um fluido (spec 010): gotículas, espuma e bolhas sobre a nuvem de pontos. */
export const diffuseSprite = wgslModule({
    name: 'diffuse_sprite',
    source: diffuseSpriteSource,
    requires: [
        random,
        hashAddress,
        camera,
        materialPointTypes,
        closure,
        sceneLightingReady,
        sceneFogReady,
        camerasResource,
        worldsResource,
        renderablesResource,
        drawVisibleResource,
        diffuseMaterialsResource,
        forwardFrameResource,
        pointVerticesResource,
        previousWorldsResource,
        pointPreviousVerticesResource,
    ],
    structs: [
        Camera.matricesSchema,
        Transform.worldSchema,
        Transform.previousWorldSchema,
        RenderableSchema,
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
        drawVisibleResource,
        wireframeMaterialsResource,
        forwardFrameResource,
        wireVerticesResource,
        wireEdgesResource,
    ],
    structs: [
        Camera.matricesSchema,
        Transform.worldSchema,
        RenderableSchema,
        WireframeMaterialSchema,
        ForwardFrameParamsSchema,
    ],
});

/**
 * Recursos dos transmissivos (spec 011, R6; spec 034): a profundidade dos opacos lida pelo pedido da refração, privada do
 * estágio que o grava.
 */
export const transmissionResources = {
    /** Profundidade dos opacos (sem amostras): o pedido fica à frente deles. */
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
} as const;

/**
 * Pedido da refração (spec 034, R1): o vértice do forward e o fragmento que marca, por pixel, a primeira interface vista
 * (distância e face), à frente dos opacos (a profundidade deles, com ou sem amostras).
 */
export const forwardRefractionRequest = {
    /** Alvos sem amostras. */
    single: refractionRequestModule(false),
    /** Alvos com MSAA (a profundidade dos opacos com amostras; o pedido, sem). */
    multisampled: refractionRequestModule(true),
} as const;

function refractionRequestModule(multisampled: boolean): WgslModule {
    return wgslModule({
        name: multisampled ? 'forward_refraction_request_ms' : 'forward_refraction_request',
        source: forwardRefractionRequestSource,
        requires: [
            forward,
            viewSpace,
            REFRACTION_REQUEST_VALID.module,
            REFRACTION_REQUEST_BACK_FACE.module,
            multisampled ? transmissionResources.sceneDepthMs : transmissionResources.sceneDepth,
        ],
    });
}

/**
 * Luz que entra nos materiais com subsuperfície (spec 011, T113): o vértice do forward e o fragmento que guarda, por
 * pixel, a irradiância difusa que chega pela frente e a que atravessa o corpo (`fs_subsurface_irradiance`), à frente dos
 * opacos (a profundidade deles, com ou sem amostras).
 */
export const forwardSubsurfaceIrradiance = {
    /** Alvos sem amostras. */
    single: subsurfaceIrradianceModule(false),
    /** Alvos com MSAA (a profundidade dos opacos com amostras; a luz guardada, sem). */
    multisampled: subsurfaceIrradianceModule(true),
} as const;

function subsurfaceIrradianceModule(multisampled: boolean): WgslModule {
    return wgslModule({
        name: multisampled ? 'forward_subsurface_irradiance_ms' : 'forward_subsurface_irradiance',
        source: forwardSubsurfaceIrradianceSource,
        requires: [
            forward,
            subsurface,
            sceneTransmittedLightingReady,
            multisampled ? transmissionResources.sceneDepthMs : transmissionResources.sceneDepth,
        ],
    });
}

/**
 * Recursos da difusão da subsuperfície (spec 011, T113): os alvos do `Subsurface` lidos pelos fragmentos que difundem,
 * privados do estágio que os grava.
 */
export const subsurfaceResources = {
    /** A luz que o perfil espalha (a da frente mais a que atravessa sobre o albedo); alfa 1 onde há. */
    irradiance: wgslResource({
        name: 'subsurface_irradiance',
        binding: { texture: { sample: 'f32' } },
        frequency: 'frame',
        provider: 'private',
    }),
    /** A luz da frente pela saída do fechamento (o que o passe principal já desenhou); no alfa, a distância à frente. */
    local: wgslResource({
        name: 'subsurface_local',
        binding: { texture: { sample: 'f32' } },
        frequency: 'frame',
        provider: 'private',
    }),
    /** A profundidade das superfícies com subsuperfície. */
    depth: wgslResource({
        name: 'subsurface_depth',
        binding: { texture: { sample: 'depth' } },
        frequency: 'frame',
        provider: 'private',
    }),
    /** O que do lobo sai para quem vê por unidade de luz difundida (o peso, o albedo e as camadas de cima). */
    exit: wgslResource({
        name: 'subsurface_exit',
        binding: { texture: { sample: 'f32' } },
        frequency: 'frame',
        provider: 'private',
    }),
    /** A luz juntada pelo perfil em volta de cada pixel; no alfa, a distância à frente da câmera. */
    diffused: wgslResource({
        name: 'subsurface_diffused',
        binding: { texture: { sample: 'f32' } },
        frequency: 'frame',
        provider: 'private',
    }),
} as const;

/**
 * Difusão da luz sob a superfície (spec 011, T113): o vértice do forward e o fragmento que junta a luz guardada em volta
 * do ponto pelo perfil de Burley do fechamento (`fs_subsurface_gather`), no alvo `diffused`.
 */
export const forwardSubsurfaceGather = wgslModule({
    name: 'forward_subsurface_gather',
    source: forwardSubsurfaceGatherSource,
    requires: [
        forward,
        subsurface,
        basis,
        constants,
        cameraSpace,
        viewSpace,
        subsurfaceResources.irradiance,
        subsurfaceResources.depth,
    ],
});

/**
 * A luz difundida somada à cor da cena (spec 011, T113): o vértice do forward e o fragmento que faz a média de
 * `diffused` na vizinhança da mesma superfície (`fs_subsurface_apply`).
 */
export const forwardSubsurfaceApply = wgslModule({
    name: 'forward_subsurface_apply',
    source: forwardSubsurfaceApplySource,
    requires: [
        forward,
        subsurfaceResources.diffused,
        subsurfaceResources.local,
        subsurfaceResources.exit,
    ],
});
