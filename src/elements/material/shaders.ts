import { wgslModule } from '../../scene/shaders/WgslModule';
import { brdf } from '../gpu/shaders/math';
import forwardSource from '../gpu/wgsl/forward.wgsl?raw';
import { Camera } from '../scene/Camera';
import { Transform } from '../scene/Transform';
import { ForwardShadowParamsSchema } from './forwardSchemas';
import { StandardMaterialSchema } from './StandardMaterialSchema';

/** Shader do desenho forward (vértice + fragmento), usado pelos materiais padrão. */
export const forward = wgslModule({
    name: 'forward',
    source: forwardSource,
    requires: [brdf],
    structs: [
        Camera.schema,
        Transform.worldSchema,
        StandardMaterialSchema,
        ForwardShadowParamsSchema,
    ],
});
