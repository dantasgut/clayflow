import type { ResourceStateHandler } from '../ResourceStateHandler';
import { ResourceState } from '../../ResourceState';

export class UninitializedResourceStateHandler implements ResourceStateHandler {
    public readonly stateId = ResourceState.Uninitialized;

    canRender():         boolean { return false; }
    needsAllocation():   boolean { return true;  }
    needsUpdate():       boolean { return false; }
    needsDisposal():     boolean { return false; }
    suppressCpuUpload(): boolean { return false; }
    ignoreDirtyMark():   boolean { return true;  }

    validTransitions(): readonly ResourceState[] {
        return [ResourceState.Loading];
    }
}
