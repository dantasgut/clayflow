import { wgslModule } from '../../../scene/shaders/WgslModule';
import { POINT_PARAMS, wgslPoint } from '../../../scene/shaders/WgslPoint';
import { wgslResource, type WgslResourceType } from '../../../scene/shaders/WgslResource';
import { WORKGROUP_SIZE } from '../../../scene/shaders/engineConstants';
import { camera, finite, linalg, mat, quat } from '../../gpu/shaders/math';
import {
    cameraMatricesWriteResource,
    cameraParamsResource,
    lightsResource,
    shadowMatricesWriteResource,
    transformsResource,
    worldsResource,
    worldsWriteResource,
} from '../resources';
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

// Recursos privados dos estágios de transformação, câmera e matriz de sombra (spec 031): parâmetros do estágio e listas
// em `stage`; regiões por grupo ou nível (offset dinâmico) em `draw`. Registros e listas mantidos pela C2 vêm do pool.

const stageUniform = (name: string, type: WgslResourceType): ReturnType<typeof wgslResource> =>
    wgslResource({
        name,
        binding: { uniform: true },
        type,
        frequency: 'stage',
        provider: 'private',
    });
const stepUniform = (name: string, type: WgslResourceType): ReturnType<typeof wgslResource> =>
    wgslResource({
        name,
        binding: { uniform: true },
        type,
        frequency: 'draw',
        provider: 'private',
    });
const poolRead = (name: string, type: WgslResourceType & { readonly schema: { name: string } }) =>
    wgslResource({
        name,
        binding: { storage: 'read' },
        type,
        frequency: 'stage',
        provider: { pool: type.schema.name },
    });

/** Recursos do estágio de transformação. */
export const transformResources = Object.freeze({
    params: stageUniform('params', { schema: TransformParamsSchema }),
    links: wgslResource({
        name: 'links',
        binding: { storage: 'read' },
        type: { schema: TransformLinkSchema, array: true },
        frequency: 'stage',
        provider: 'private',
    }),
    level: stepUniform('level', { schema: TransformLevelSchema }),
    fnRecords: poolRead('transform_fn_records', { schema: TransformFnRecordSchema, array: true }),
    fnPairs: wgslResource({
        name: 'transform_fn_pairs',
        binding: { storage: 'read' },
        type: { wgsl: 'vec2u', array: true },
        frequency: 'stage',
        provider: 'private',
    }),
    fnGroup: stepUniform('transform_fn_group', { schema: TransformFnGroupSchema }),
});

/** Recursos do estágio de câmera. */
export const cameraResources = Object.freeze({
    compose: stageUniform('compose', { schema: CameraComposeParamsSchema }),
    records: poolRead('camera_records', { schema: CameraRecordSchema, array: true }),
    list: poolRead('camera_list', { schema: CameraInstanceSchema, array: true }),
    fnRecords: poolRead('camera_fn_records', { schema: CameraFnRecordSchema, array: true }),
    fnList: wgslResource({
        name: 'camera_fn_list',
        binding: { storage: 'read' },
        type: { wgsl: 'vec4u', array: true },
        frequency: 'stage',
        provider: 'private',
    }),
    fnGroup: stepUniform('camera_fn_group', { schema: CameraFnGroupSchema }),
});

/** Recursos do estágio da matriz de sombra. */
export const shadowMatrixResources = Object.freeze({
    params: stageUniform('shadow_params', { schema: ShadowMatrixParamsSchema }),
    records: poolRead('shadow_records', { schema: ShadowRecordSchema, array: true }),
    list: poolRead('shadow_list', { schema: ShadowMatrixInstanceSchema, array: true }),
});

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
    requires: [
        transformLocal,
        WORKGROUP_SIZE.module,
        transformsResource,
        worldsWriteResource,
        transformResources.params,
    ],
    structs: [Transform.schema, Transform.worldSchema, TransformParamsSchema],
});

/** Um nível da hierarquia: `world = world[pai] · M` para cada elo do nível (spec 007). */
export const transformLink = wgslModule({
    name: 'transform_link',
    source: transformLinkSource,
    requires: [
        transformLocal,
        WORKGROUP_SIZE.module,
        transformsResource,
        worldsWriteResource,
        transformResources.links,
        transformResources.level,
    ],
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
    requires: [
        transformLocal,
        linalg,
        finite,
        transformFnReady,
        WORKGROUP_SIZE.module,
        transformsResource,
        worldsWriteResource,
        transformResources.fnRecords,
        transformResources.fnPairs,
        transformResources.fnGroup,
    ],
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
        names: ['slot', 't', 'data', 'time'],
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
    requires: [
        camera,
        WORKGROUP_SIZE.module,
        cameraParamsResource,
        cameraMatricesWriteResource,
        worldsResource,
        cameraResources.records,
        cameraResources.list,
        cameraResources.compose,
    ],
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
    requires: [
        cameraPointTypes,
        camera,
        finite,
        cameraFnReady,
        WORKGROUP_SIZE.module,
        cameraParamsResource,
        cameraMatricesWriteResource,
        worldsResource,
        cameraResources.fnRecords,
        cameraResources.fnList,
        cameraResources.fnGroup,
    ],
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
        names: ['c', 'world', 'aspect', 'data', 'time'],
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
    requires: [
        camera,
        WORKGROUP_SIZE.module,
        lightsResource,
        shadowMatricesWriteResource,
        shadowMatrixResources.records,
        shadowMatrixResources.list,
        shadowMatrixResources.params,
    ],
    structs: [
        Light.schema,
        ShadowMap.matrixSchema,
        ShadowRecordSchema,
        ShadowMatrixInstanceSchema,
        ShadowMatrixParamsSchema,
    ],
});
