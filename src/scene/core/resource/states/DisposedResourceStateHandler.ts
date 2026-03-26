import type { ResourceStateHandler } from '../ResourceStateHandler';
import { ResourceState } from '../../ResourceState';

export class DisposedResourceStateHandler implements ResourceStateHandler {
    public readonly stateId = ResourceState.Disposed;

    canRender():         boolean { return false; }
    needsAllocation():   boolean { return false; }
    needsUpdate():       boolean { return false; }
    needsDisposal():     boolean { return true;  }
    suppressCpuUpload(): boolean { return false; }
    ignoreDirtyMark():   boolean { return true;  }

    validTransitions(): readonly ResourceState[] {
        return [ResourceState.Destroyed];
    }
}
