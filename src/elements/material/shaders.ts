import { wgslModule } from '../../scene/shaders/WgslModule';
import { brdf } from '../gpu/shaders/math';
import forwardSource from '../gpu/wgsl/forward.wgsl?raw';
import particleSpriteSource from '../gpu/wgsl/particle_sprite.wgsl?raw';
import { Camera } from '../scene/Camera';
import { Transform } from '../scene/Transform';
import { RenderableSchema, RenderInstanceSchema } from '../scene/Renderable';
import { ForwardFrameParamsSchema, ParticleDrawParamsSchema } from './forwardSchemas';
import { Light } from '../scene/Light';
import { ShadowMap } from '../scene/ShadowMap';
import { StandardMaterialSchema } from './StandardMaterialSchema';
import { PointSpriteMaterialSchema } from './PointSpriteMaterialSchema';

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
