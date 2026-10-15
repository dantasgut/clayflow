import { wgslModule } from '../../../scene/shaders/WgslModule';
import { POINT_PARAMS, wgslPoint } from '../../../scene/shaders/WgslPoint';
import { camera, linalg, mat, quat } from '../../gpu/shaders/math';
import transformComposeSource from '../../gpu/wgsl/kernels/transform_compose.wgsl?raw';
import transformLinkSource from '../../gpu/wgsl/kernels/transform_link.wgsl?raw';
import transformLocalSource from '../../gpu/wgsl/kernels/transform_local.wgsl?raw';
import transformFnReadySource from '../../gpu/wgsl/kernels/transform_fn_ready.wgsl?raw';
import transformComposeFnSource from '../../gpu/wgsl/kernels/transform_compose_fn.wgsl?raw';
import cameraComposeSource from '../../gpu/wgsl/kernels/camera_compose.wgsl?raw';
import cameraPointTypesSource from '../../gpu/wgsl/kernels/camera_point_types.wgsl?raw';
import cameraFnReadySource from '../../gpu/wgsl/kernels/camera_fn_ready.wgsl?raw';
import cameraComposeFnSource from '../../gpu/wgsl/kernels/camera_compose_fn.wgsl?raw';
import shadowMatrixSource from '../../gpu/wgsl/kernels/shadow_matrix.wgsl?raw';
import { Camera } from '../Camera';
import { Light } from '../Light';
import { ShadowMap } from '../ShadowMap';
import {
    CameraComposeParamsSchema,
    CameraFnGroupSchema,
    CameraFnRecordSchema,
    CameraInstanceSchema,
    CameraRecordSchema,
} from './CameraSchemas';
import {
    ShadowMatrixInstanceSchema,
    ShadowMatrixParamsSchema,
    ShadowRecordSchema,
} from './ShadowMatrixSchemas';
import { Transform } from '../../scene/Transform';
import {
    TransformFnGroupSchema,
    TransformFnRecordSchema,
    TransformLevelSchema,
    TransformLinkSchema,
    TransformParamsSchema,
} from './TransformParams';

/** Matriz local `M = T · R · S` e matriz de normais de um `Transform` (raízes e níveis da hierarquia). */
export const transformLocal = wgslModule({
    name: 'transform_local',
    source: transformLocalSource,
    requires: [quat, mat],
    structs: [Transform.schema, Transform.worldSchema],
});

/** Composição `M = T · R · S` e matriz de normais de cada `Transform` (estágio de transformação). */
export const transformCompose = wgslModule({
    name: 'transform_compose',
    source: transformComposeSource,
    requires: [transformLocal],
    structs: [Transform.schema, Transform.worldSchema, TransformParamsSchema],
});

/** Um nível da hierarquia: `world = world[pai] · M` para cada elo do nível (spec 007). */
export const transformLink = wgslModule({
    name: 'transform_link',
    source: transformLinkSource,
    requires: [transformLocal],
    structs: [Transform.schema, Transform.worldSchema, TransformLinkSchema, TransformLevelSchema],
});

/** Função pronta do ponto `transform` (spec 009): o TRS. Uma `TransformFunction` toma o lugar deste módulo. */
export const transformFnReady = wgslModule({
    name: 'transform_fn_ready',
    source: transformFnReadySource,
    requires: [transformLocal],
    structs: [Transform.schema, Transform.worldSchema, TransformFnRecordSchema],
});

/** Composição de um grupo de entidades pela função `transform` delas (spec 009). */
export const transformComposeFn = wgslModule({
    name: 'transform_compose_fn',
    source: transformComposeFnSource,
    // `transform_local` (e quat, mat, linalg) ficam à mão das funções do usuário, que substituem só o pronto.
    requires: [transformLocal, linalg, transformFnReady],
    structs: [
        Transform.schema,
        Transform.worldSchema,
        TransformFnRecordSchema,
        TransformFnGroupSchema,
    ],
});

/**
 * Ponto `transform` (spec 009): `fn transform_fn(slot: u32, t: Transform, data: TransformFnParams, time: f32) ->
 * mat4x4f` — a matriz local da entidade (o `Parent` compõe sobre ela). Pronta: TRS. Disponíveis para a função:
 * `transform_local` (TRS), `quat`, `mat` e `linalg` da `wgslLib`.
 */
export const transformPoint = wgslPoint({
    name: 'transform',
    required: {
        name: 'transform_fn',
        params: ['u32', 'Transform', POINT_PARAMS, 'f32'],
        returns: 'mat4x4f',
    },
    paramsAlias: 'TransformFnParams',
    record: TransformFnRecordSchema,
    ready: transformFnReady,
    hosts: () => [transformComposeFn],
});

/** Matrizes de cada câmera viva a partir dos parâmetros e da matriz de mundo do seu `Transform` (spec 007). */
export const cameraCompose = wgslModule({
    name: 'camera_compose',
    source: cameraComposeSource,
    requires: [camera],
    structs: [
        Camera.schema,
        Camera.matricesSchema,
        Transform.worldSchema,
        CameraRecordSchema,
        CameraInstanceSchema,
        CameraComposeParamsSchema,
    ],
});

/** Tipos do ponto `camera` (spec 009): `CameraOut { view, projection }`. */
export const cameraPointTypes = wgslModule({
    name: 'camera_point_types',
    source: cameraPointTypesSource,
});

/** Função pronta do ponto `camera` (spec 009): vista rígida e perspectiva/ortográfica. */
export const cameraFnReady = wgslModule({
    name: 'camera_fn_ready',
    source: cameraFnReadySource,
    requires: [cameraPointTypes, camera],
    structs: [Camera.schema, CameraFnRecordSchema],
});

/** Câmeras de um grupo de função `camera` (spec 009), depois da composição padrão. */
export const cameraComposeFn = wgslModule({
    name: 'camera_compose_fn',
    source: cameraComposeFnSource,
    // `camera` (perspectiva, ortográfica, vista, lookAt) e os tipos ficam à mão da função do usuário.
    requires: [cameraPointTypes, camera, cameraFnReady],
    structs: [
        Camera.schema,
        Camera.matricesSchema,
        Transform.worldSchema,
        CameraFnRecordSchema,
        CameraFnGroupSchema,
    ],
});

/**
 * Ponto `camera` (spec 009): `fn camera_fn(c: Camera, world: mat4x4f, aspect: f32, data: CameraFnParams, time: f32)
 * -> CameraOut` (vista e projeção) e, opcional, `fn camera_project(view_pos: vec3f, data: CameraFnParams) -> vec4f`
 * — a projeção de um ponto da vista para o clip, para projeções que não cabem numa matriz (aplicada por vértice no
 * desenho). Pronta: perspectiva/ortográfica e vista rígida. Disponíveis para a função: `camera_perspective`,
 * `camera_orthographic`, `camera_view`, `camera_look_at`, `mat`, `quat`, `linalg`.
 */
export const cameraPoint = wgslPoint({
    name: 'camera',
    required: {
        name: 'camera_fn',
        params: ['Camera', 'mat4x4f', 'f32', POINT_PARAMS, 'f32'],
        returns: 'CameraOut',
    },
    optional: [{ name: 'camera_project', params: ['vec3f', POINT_PARAMS], returns: 'vec4f' }],
    paramsAlias: 'CameraFnParams',
    record: CameraFnRecordSchema,
    ready: cameraFnReady,
    hosts: () => [cameraComposeFn],
});

/** Matriz luz-vista-projeção de cada luz direcional que projeta sombra, a partir da direção dela (spec 007). */
export const shadowMatrix = wgslModule({
    name: 'shadow_matrix',
    source: shadowMatrixSource,
    requires: [camera],
    structs: [
        Light.schema,
        ShadowMap.matrixSchema,
        ShadowRecordSchema,
        ShadowMatrixInstanceSchema,
        ShadowMatrixParamsSchema,
    ],
});
