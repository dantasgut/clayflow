import { Entity } from '../../../scene/contracts/Entity';
import { ResourceState } from '../../../scene/contracts/ResourceState';
import type { Resource } from '../../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import type { FlowDescriptor } from '../../../scene/descriptors/FlowDescriptor';

export abstract class PhysicsBody extends Entity implements Resource {
    state: ResourceState = ResourceState.Uninitialized;
    data: Record<string, unknown> = {};

    abstract getDescriptors(): readonly GPUDescriptor[];

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }

    abstract getFlowDescriptors(): readonly FlowDescriptor[];
}
