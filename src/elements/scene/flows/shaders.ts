import { wgslModule } from '../../../scene/shaders/WgslModule';
import { camera, mat, quat } from '../../gpu/shaders/math';
import transformComposeSource from '../../gpu/wgsl/kernels/transform_compose.wgsl?raw';
import transformLinkSource from '../../gpu/wgsl/kernels/transform_link.wgsl?raw';
import transformLocalSource from '../../gpu/wgsl/kernels/transform_local.wgsl?raw';
import cameraComposeSource from '../../gpu/wgsl/kernels/camera_compose.wgsl?raw';
import shadowMatrixSource from '../../gpu/wgsl/kernels/shadow_matrix.wgsl?raw';
import { Camera } from '../Camera';
import { Light } from '../Light';
import { ShadowMap } from '../ShadowMap';
import {
    CameraComposeParamsSchema,
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
