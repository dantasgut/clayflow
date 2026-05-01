import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../scene/descriptors/FieldType';
import { StructSchema } from '../../scene/descriptors/StructSchema';

export class Time extends Entity implements Resource {
    static readonly schema = new StructSchema('Time', {
        dt: FieldType.f32,
        elapsed: FieldType.f32,
        fixedDt: FieldType.f32,
        scale: FieldType.f32,
    });

    state: ResourceState = ResourceState.Uninitialized;
    data: Record<string, unknown> = {};

    constructor() {
        super();
        this.data = Time.schema.applyDefaults({ dt: 0, elapsed: 0, fixedDt: 1 / 60, scale: 1 });
    }

    update(dt: number): void {
        this.data.dt = dt;
        this.data.elapsed = (this.data.elapsed as number) + dt;
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'time', role: 'uniform', schema: Time.schema }];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
