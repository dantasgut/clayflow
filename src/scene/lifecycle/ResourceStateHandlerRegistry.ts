import { ResourceState } from '../contracts/ResourceState';
import type { ResourceStateHandler } from './ResourceStateHandler';
import { DestroyedResourceStateHandler } from './states/DestroyedResourceStateHandler';
import { DirtyResourceStateHandler } from './states/DirtyResourceStateHandler';
import { DisposedResourceStateHandler } from './states/DisposedResourceStateHandler';
import { GpuManagedResourceStateHandler } from './states/GpuManagedResourceStateHandler';
import { LoadingResourceStateHandler } from './states/LoadingResourceStateHandler';
import { ReadyResourceStateHandler } from './states/ReadyResourceStateHandler';
import { UninitializedResourceStateHandler } from './states/UninitializedResourceStateHandler';

export class ResourceStateHandlerRegistry {
    private readonly handlers: ReadonlyMap<ResourceState, ResourceStateHandler>;

    constructor() {
        const map = new Map<ResourceState, ResourceStateHandler>();
        map.set(ResourceState.Uninitialized, new UninitializedResourceStateHandler());
        map.set(ResourceState.Loading, new LoadingResourceStateHandler());
        map.set(ResourceState.Ready, new ReadyResourceStateHandler());
        map.set(ResourceState.Dirty, new DirtyResourceStateHandler());
        map.set(ResourceState.GpuManaged, new GpuManagedResourceStateHandler());
        map.set(ResourceState.Disposed, new DisposedResourceStateHandler());
        map.set(ResourceState.Destroyed, new DestroyedResourceStateHandler());
        this.handlers = map;
    }

    get(state: ResourceState): ResourceStateHandler {
        const handler = this.handlers.get(state);
        if (handler === undefined)
            throw new Error(`ResourceStateHandlerRegistry: no handler for state ${state}`);
        return handler;
    }

    canTransition(from: ResourceState, to: ResourceState): boolean {
        return this.get(from).validTransitions().includes(to);
    }
}
