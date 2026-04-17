import type { ResourceStateHandler } from '../ResourceStateHandler';
import { ResourceState } from '../../ResourceState';

export class ReadyResourceStateHandler implements ResourceStateHandler {
    public readonly stateId = ResourceState.Ready;

    canRender():         boolean { return true;  }
    needsAllocation():   boolean { return false; }
    needsUpdate():       boolean { return false; }
    needsDisposal():     boolean { return false; }
    suppressCpuUpload(): boolean { return false; }
    ignoreDirtyMark():   boolean { return false; }

    validTransitions(): readonly ResourceState[] {
        return [ResourceState.Dirty, ResourceState.Disposed, ResourceState.GpuManaged];
    }
}
