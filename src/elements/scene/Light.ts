import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

export abstract class Light extends Entity implements Resource {
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

    getDescriptors(): readonly GPUDescriptor[] {
        return [{
            id: 'light',
            role: 'storage-ro',
            schema: Light.schema,
            storage: 'pool',
        }];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
