import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

export class Camera extends Entity implements Resource {
    static readonly schema = new StructSchema('Camera', {
        view: FieldType.mat4x4f,
        projection: FieldType.mat4x4f,
        viewProjection: FieldType.mat4x4f,
        position: FieldType.vec4f,
        near: FieldType.f32,
        far: FieldType.f32,
        fov: FieldType.f32,
        aspect: FieldType.f32,
    });

    state: ResourceState = ResourceState.Uninitialized;
    data: Record<string, unknown> = {};

    constructor(values: Record<string, unknown> = {}) {
        super();
        this.data = Camera.schema.applyDefaults({
            position: values['position'] ?? [0, 0, 5, 1],
            near: values['near'] ?? 0.1,
            far: values['far'] ?? 1000.0,
            fov: values['fov'] ?? Math.PI / 4,
            aspect: values['aspect'] ?? 16 / 9,
            view: values['view'] ?? identity(),
            projection: values['projection'] ?? identity(),
            viewProjection: values['viewProjection'] ?? identity(),
        });
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'camera', role: 'uniform', schema: Camera.schema }];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}

function identity(): readonly number[] {
    return [1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  0, 0, 0, 1];
}
