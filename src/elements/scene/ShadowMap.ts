import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

export class ShadowMap extends Entity implements Resource {
    static readonly schema = new StructSchema('ShadowMap', {
        lightViewProj: FieldType.mat4x4f,
        bias: FieldType.f32,
        normalBias: FieldType.f32,
        size: FieldType.vec2f,
    });

    state: ResourceState = ResourceState.Uninitialized;
    data: Record<string, unknown> = {};

    constructor(values: Record<string, unknown> = {}) {
        super();
        this.data = ShadowMap.schema.applyDefaults({
            lightViewProj: values['lightViewProj'] ?? identity(),
            bias: values['bias'] ?? 0.0001,
            normalBias: values['normalBias'] ?? 0.001,
            size: values['size'] ?? [2048, 2048],
        });
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [{
            id: 'shadowmap',
            role: 'storage-ro',
            schema: ShadowMap.schema,
            storage: 'pool',
        }];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}

function identity(): readonly number[] {
    return [1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  0, 0, 0, 1];
}
