import { wgslModule } from '../../../scene/shaders/WgslModule';
import { mat, quat } from '../../gpu/shaders/math';
import transformComposeSource from '../../gpu/wgsl/kernels/transform_compose.wgsl?raw';
import { Transform } from '../../scene/Transform';
import { TransformParamsSchema } from './TransformParams';

/** Composição `M = T · R · S` e matriz de normais de cada `Transform` (estágio de transformação). */
export const transformCompose = wgslModule({
    name: 'transform_compose',
    source: transformComposeSource,
    requires: [quat, mat],
    structs: [Transform.schema, Transform.worldSchema, TransformParamsSchema],
});
