import { wgslModule } from '../../../scene/shaders/WgslModule';
import { camera, mat, quat } from '../../gpu/shaders/math';
import transformComposeSource from '../../gpu/wgsl/kernels/transform_compose.wgsl?raw';
import cameraComposeSource from '../../gpu/wgsl/kernels/camera_compose.wgsl?raw';
import { Camera } from '../Camera';
import {
    CameraComposeParamsSchema,
    CameraInstanceSchema,
    CameraRecordSchema,
} from './CameraSchemas';
import { Transform } from '../../scene/Transform';
import { TransformParamsSchema } from './TransformParams';

/** Composição `M = T · R · S` e matriz de normais de cada `Transform` (estágio de transformação). */
export const transformCompose = wgslModule({
    name: 'transform_compose',
    source: transformComposeSource,
    requires: [quat, mat],
    structs: [Transform.schema, Transform.worldSchema, TransformParamsSchema],
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
