import { Entity } from '../../../scene/contracts/Entity';
import { ResourceState } from '../../../scene/contracts/ResourceState';
import type { Resource } from '../../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';

/** Base dos campos de força; `TData` tipa o `data` (ver `Entity`). */
export abstract class ForceField<TData extends object = Record<string, unknown>>
    extends Entity<TData>
    implements Resource
{
    state: ResourceState = ResourceState.Uninitialized;

    abstract getDescriptors(): readonly GPUDescriptor[];

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
