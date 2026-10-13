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
    /** Transições válidas por estado, calculadas uma vez. */
    private readonly transitions: ReadonlyMap<ResourceState, ReadonlySet<ResourceState>>;

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
        this.transitions = new Map(
            [...map].map(([state, handler]) => [state, new Set(handler.validTransitions())]),
        );
    }

    get(state: ResourceState): ResourceStateHandler {
        const handler = this.handlers.get(state);
        if (handler === undefined)
            throw new Error(`ResourceStateHandlerRegistry: no handler for state ${state}`);
        return handler;
    }

    canTransition(from: ResourceState, to: ResourceState): boolean {
        return this.transitions.get(from)?.has(to) ?? false;
    }
}
