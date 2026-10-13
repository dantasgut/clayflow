import { Entity } from '../../../scene/contracts/Entity';
import { ResourceState } from '../../../scene/contracts/ResourceState';
import type { Resource } from '../../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';

/** Base das restrições; `TData` tipa o `data` (ver `Entity`). */
export abstract class Constraint<TData extends object = Record<string, unknown>>
    extends Entity<TData>
    implements Resource
{
    state: ResourceState = ResourceState.Uninitialized;

    abstract getDescriptors(): readonly GPUDescriptor[];

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
