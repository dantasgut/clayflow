import type { ResourceStateHandler } from './ResourceStateHandler';
import { ResourceState } from '../ResourceState';
import { UninitializedResourceStateHandler } from './states/UninitializedResourceStateHandler';
import { LoadingResourceStateHandler }       from './states/LoadingResourceStateHandler';
import { ReadyResourceStateHandler }         from './states/ReadyResourceStateHandler';
import { DirtyResourceStateHandler }         from './states/DirtyResourceStateHandler';
import { DisposedResourceStateHandler }      from './states/DisposedResourceStateHandler';
import { DestroyedResourceStateHandler }     from './states/DestroyedResourceStateHandler';
import { GpuManagedResourceStateHandler }    from './states/GpuManagedResourceStateHandler';

/** Flyweight — um singleton imutável por estado. */
const HANDLERS: Record<ResourceState, ResourceStateHandler> = {
    [ResourceState.Uninitialized]: new UninitializedResourceStateHandler(),
    [ResourceState.Loading]:       new LoadingResourceStateHandler(),
    [ResourceState.Ready]:         new ReadyResourceStateHandler(),
    [ResourceState.Dirty]:         new DirtyResourceStateHandler(),
    [ResourceState.Disposed]:      new DisposedResourceStateHandler(),
    [ResourceState.Destroyed]:     new DestroyedResourceStateHandler(),
    [ResourceState.GpuManaged]:    new GpuManagedResourceStateHandler(),
};

export const ResourceStateHandlerRegistry = {
    get(state: ResourceState): ResourceStateHandler {
        return HANDLERS[state]!;
    },
};
