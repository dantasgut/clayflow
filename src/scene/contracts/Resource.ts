import type { FlowDescriptor } from '../descriptors/FlowDescriptor';
import type { GPUDescriptor } from '../descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../descriptors/PipelineDescriptor';
import type { ResourceState } from './ResourceState';

export interface Resource {
    state: ResourceState;
    data: Record<string, unknown>;

    getDescriptors(): readonly GPUDescriptor[];
    getPipelineDescriptors(): readonly PipelineDescriptor[];
    getFlowDescriptors?(): readonly FlowDescriptor[];
}
