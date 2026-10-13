import { wgslModule } from '../../scene/shaders/WgslModule';
import { brdf } from '../gpu/shaders/math';
import forwardSource from '../gpu/wgsl/forward.wgsl?raw';
import { Camera } from '../scene/Camera';
import { Transform } from '../scene/Transform';
import { RenderableSchema, RenderInstanceSchema } from '../scene/Renderable';
import { ForwardFrameParamsSchema } from './forwardSchemas';
import { Light } from '../scene/Light';
import { ShadowMap } from '../scene/ShadowMap';
import { StandardMaterialSchema } from './StandardMaterialSchema';

/** Shader do desenho forward (vértice + fragmento), usado pelos materiais padrão. */
export const forward = wgslModule({
    name: 'forward',
    source: forwardSource,
    requires: [brdf],
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
    ],
});
