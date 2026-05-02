import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

/**
 * Light é a base de todos os tipos de luz (DirectionalLight, PointLight,
 * SpotLight). Compartilham um struct comum coalescível em pool — múltiplas
 * lights são lidas simultaneamente por shaders no fragment stage.
 *
 * `kind` enum interno: 0 = directional, 1 = point, 2 = spot.
 */
export abstract class Light extends Entity implements Resource {
    /** Schema unified — todos os tipos de light usam o mesmo layout. */
    static readonly schema = new StructSchema('Light', {
        kind: FieldType.u32,
        castShadow: FieldType.u32,
        intensity: FieldType.f32,
        range: FieldType.f32,
        position: FieldType.vec4f,
        direction: FieldType.vec4f,
        color: FieldType.vec4f,
    });

    state: ResourceState = ResourceState.Uninitialized;
    data: Record<string, unknown> = {};

    /** Pool storage read-only — fragment shaders iteram sobre o array de lights. */
    getDescriptors(): readonly GPUDescriptor[] {
        return [
            {
                id: 'light',
                role: 'storage-ro',
                schema: Light.schema,
                storage: 'pool',
            },
        ];
    }

    /** Sem pipelines próprios — Light é dado, ForwardFlow é quem itera. */
    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
