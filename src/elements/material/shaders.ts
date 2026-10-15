import { wgslModule, type WgslModule } from '../../scene/shaders/WgslModule';
import type { BindablePoint } from '../../scene/shaders/bindPoints';
import { brdf, camera } from '../gpu/shaders/math';
import { CameraFnRecordSchema } from '../scene/flows/CameraSchemas';
import { cameraPointTypes } from '../scene/flows/shaders';
import { forwardMaterialReady, materialPointTypes } from './point/shaders';
import forwardSource from '../gpu/wgsl/forward.wgsl?raw';
import forwardCameraReadySource from '../gpu/wgsl/forward_camera_ready.wgsl?raw';
import forwardCameraFnSource from '../gpu/wgsl/forward_camera_fn.wgsl?raw';
import particleSpriteSource from '../gpu/wgsl/particle_sprite.wgsl?raw';
import pointSpriteSource from '../gpu/wgsl/point_sprite.wgsl?raw';
import wireSource from '../gpu/wgsl/wire.wgsl?raw';
import waterViewSource from '../gpu/wgsl/water/water_view.wgsl?raw';
import waterSpheresSource from '../gpu/wgsl/water/water_spheres.wgsl?raw';
import waterSceneSource from '../gpu/wgsl/water/water_scene.wgsl?raw';
import waterSmoothSource from '../gpu/wgsl/water/water_smooth.wgsl?raw';
import causticsSource from '../gpu/wgsl/water/caustics.wgsl?raw';
import waterLightSource from '../gpu/wgsl/water/water_light.wgsl?raw';
import waterRippleSource from '../gpu/wgsl/water/water_ripple.wgsl?raw';
import waterCompositeSource from '../gpu/wgsl/water/water_composite.wgsl?raw';
import { Camera } from '../scene/Camera';
import { Transform } from '../scene/Transform';
import { RenderableSchema, RenderInstanceSchema } from '../scene/Renderable';
import {
    CausticParamsSchema,
    ForwardFrameParamsSchema,
    ParticleDrawParamsSchema,
    WaterCompositeParamsSchema,
    WaterBoundsParamsSchema,
    WaterDrawParamsSchema,
    WaterLightMatrixSchema,
    WaterSmoothParamsSchema,
    WaterViewParamsSchema,
} from './forwardSchemas';
import { FluidSurfaceMaterialSchema } from './FluidSurfaceMaterialSchema';
import { Light } from '../scene/Light';
import { SurfaceDiffSchema } from '../geometry/SurfaceSchemas';
import { ShadowMap } from '../scene/ShadowMap';
import { StandardMaterialSchema } from './StandardMaterialSchema';
import { PointSpriteMaterialSchema } from './PointSpriteMaterialSchema';
import { WireframeMaterialSchema } from './WireframeMaterialSchema';

/** Projeção do forward pronta (spec 009): `camera_clip` = `viewProjection · mundo`. */
export const forwardCameraReady = wgslModule({
    name: 'forward_camera_ready',
    source: forwardCameraReadySource,
});

/**
 * Lugar da projeção no desenho forward (spec 009): `fn camera_clip(slot: u32, world: vec4f) -> vec4f`. A câmera ativa
 * com `camera_project` troca o pronto pelo adaptador da função (`forwardCameraAdapter`).
 */
export const forwardCameraClip: BindablePoint = { name: 'camera_clip', ready: forwardCameraReady };

const cameraAdapters = new WeakMap<WgslModule, WgslModule>();

/**
 * Adaptador da projeção de ponto de uma função `camera` (spec 009): `forward_camera_fn.wgsl` sobre o módulo da função
 * — liga o pool `CameraFnRecord` e projeta `camera_project(vista · mundo, parâmetros da câmera ativa)`. Memorizado por
 * módulo da função.
 */
export function forwardCameraAdapter(fnModule: WgslModule): WgslModule {
    let adapter = cameraAdapters.get(fnModule);
    if (adapter !== undefined) return adapter;
    adapter = wgslModule({
        name: 'forward_camera_fn',
        source: forwardCameraFnSource,
        requires: [cameraPointTypes, camera, fnModule],
        structs: [Camera.schema, CameraFnRecordSchema],
    });
    cameraAdapters.set(fnModule, adapter);
    return adapter;
}

/** Shader do desenho forward (vértice + fragmento), usado pelos materiais padrão. */
export const forward = wgslModule({
    name: 'forward',
    source: forwardSource,
    requires: [brdf, forwardCameraReady, materialPointTypes, forwardMaterialReady],
    structs: [
        Camera.matricesSchema,
        Transform.worldSchema,
        RenderableSchema,
        RenderInstanceSchema,
        StandardMaterialSchema,
        ForwardFrameParamsSchema,
        ShadowMap.schema,
        ShadowMap.matrixSchema,
        Light.schema,
        WaterLightMatrixSchema,
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
    requires: [brdf],
    structs: [
        Camera.matricesSchema,
        Light.schema,
        PointSpriteMaterialSchema,
        ForwardFrameParamsSchema,
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
    requires: [brdf],
    structs: [
        Camera.matricesSchema,
        Transform.worldSchema,
        RenderableSchema,
        RenderInstanceSchema,
        PointSpriteMaterialSchema,
        ForwardFrameParamsSchema,
        Light.schema,
    ],
});

/**
 * Arame com espessura (spec 008): as arestas da geometria (`wireEdges`, espaço de objeto) viram quads de `lineWidth`
 * pixels na tela, com borda suavizada — o desenho de `WireframeMaterial`.
 */
export const wire = wgslModule({
    name: 'wire',
    source: wireSource,
    structs: [
        Camera.matricesSchema,
        Transform.worldSchema,
        RenderableSchema,
        RenderInstanceSchema,
        WireframeMaterialSchema,
        ForwardFrameParamsSchema,
    ],
});

/** Vista de um produtor de superfície de água (spec 017): escalas da matriz da luz, profundidade linear e NDC. */
export const waterView = wgslModule({ name: 'water_view', source: waterViewSource });

/** Profundidade da cena de amostra única: oclusão e profundidade linear da cena no pixel. */
const waterSceneSingle = wgslModule({
    name: 'water_scene',
    source: waterSceneSource.replace('WATER_SCENE_DEPTH_TYPE', 'texture_depth_2d'),
    requires: [waterView],
});

/** A mesma, com a profundidade da cena multiamostrada (MSAA): a amostra 0 do pixel. */
const waterSceneMs = wgslModule({
    name: 'water_scene_ms',
    source: waterSceneSource.replace('WATER_SCENE_DEPTH_TYPE', 'texture_depth_multisampled_2d'),
    requires: [waterView],
});

function waterSpheresModule(name: string, scene: typeof waterSceneSingle) {
    return wgslModule({
        name,
        source: waterSpheresSource,
        requires: [waterView, scene],
        structs: [
            Camera.matricesSchema,
            WaterLightMatrixSchema,
            FluidSurfaceMaterialSchema,
            WaterViewParamsSchema,
            WaterDrawParamsSchema,
        ],
    });
}

/**
 * Esferas das partículas da superfície de água (spec 017): profundidade linear + material e espessura. Profundidade da
 * cena sem e com MSAA (na vista da câmera ela oculta a água atrás dos objetos; na da luz, um substituto sem uso).
 */
export const waterSpheres = {
    scene: waterSpheresModule('water_spheres', waterSceneSingle),
    sceneMs: waterSpheresModule('water_spheres_ms', waterSceneMs),
} as const;

/** Suavização bilateral separável da profundidade da água e borrão da espessura (spec 017). */
export const waterSmooth = wgslModule({
    name: 'water_smooth',
    source: waterSmoothSource,
    requires: [waterView],
    structs: [
        Camera.matricesSchema,
        WaterLightMatrixSchema,
        FluidSurfaceMaterialSchema,
        WaterSmoothParamsSchema,
    ],
});

/** Ondulações capilares procedurais do material de água (inclinação somada à normal; spec 017). */
const waterRipple = wgslModule({
    name: 'water_ripple',
    source: waterRippleSource,
    structs: [FluidSurfaceMaterialSchema],
});

/** Cáusticas por fótons em espaço da luz: limpar, depositar, resolver (spec 017). */
export const caustics = wgslModule({
    name: 'caustics',
    source: causticsSource,
    requires: [waterView, waterRipple],
    structs: [
        ShadowMap.matrixSchema,
        WaterLightMatrixSchema,
        FluidSurfaceMaterialSchema,
        CausticParamsSchema,
    ],
});

/**
 * Enquadramento da vista da luz da água (spec 017): caixa envolvente das partículas na base da luz e a matriz
 * ortográfica ajustada a ela.
 */
export const waterLight = wgslModule({
    name: 'water_light',
    source: waterLightSource,
    structs: [ShadowMap.matrixSchema, WaterLightMatrixSchema, WaterBoundsParamsSchema],
});

function waterCompositeModule(name: string, scene: typeof waterSceneSingle) {
    return wgslModule({
        name,
        source: waterCompositeSource,
        requires: [waterView, scene, brdf, waterRipple],
        structs: [
            Camera.matricesSchema,
            Light.schema,
            ShadowMap.schema,
            ShadowMap.matrixSchema,
            FluidSurfaceMaterialSchema,
            WaterCompositeParamsSchema,
        ],
    });
}

/** Composição óptica da água nos alvos da cena, sem e com MSAA (spec 017). */
export const waterComposite = {
    scene: waterCompositeModule('water_composite', waterSceneSingle),
    sceneMs: waterCompositeModule('water_composite_ms', waterSceneMs),
} as const;
