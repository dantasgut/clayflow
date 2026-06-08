import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

/**
 * Transform 3D — position + rotation (quaternion) + scale + matrix model
 * cacheada. Compõe meshes/cameras/lights na cena.
 */
export class Transform extends Entity implements Resource {
    /** StructSchema do Transform (position + rotation + scale + model matrix). */
    static readonly schema = new StructSchema('Transform', {
        position: FieldType.vec4f,
        rotation: FieldType.vec4f,
        scale: FieldType.vec4f,
        model: FieldType.mat4x4f,
    });

    state: ResourceState = ResourceState.Uninitialized;
    data: Record<string, unknown> = {};

    constructor(values: Record<string, unknown> = {}) {
        super();
        this.data = Transform.schema.applyDefaults({
            position: values.position ?? [0, 0, 0, 1],
            rotation: values.rotation ?? [0, 0, 0, 1],
            scale: values.scale ?? [1, 1, 1, 1],
            model: values.model ?? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        });
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'transform', role: 'uniform', schema: Transform.schema }];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
