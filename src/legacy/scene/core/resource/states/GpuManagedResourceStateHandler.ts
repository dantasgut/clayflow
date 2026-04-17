import type { ResourceStateHandler } from '../ResourceStateHandler';
import { ResourceState } from '../../ResourceState';

export class GpuManagedResourceStateHandler implements ResourceStateHandler {
    public readonly stateId = ResourceState.GpuManaged;

    canRender():         boolean { return true;  }
    needsAllocation():   boolean { return false; }
    needsUpdate():       boolean { return false; }
    needsDisposal():     boolean { return false; }
    suppressCpuUpload(): boolean { return true;  }
    ignoreDirtyMark():   boolean { return true;  }

    validTransitions(): readonly ResourceState[] {
        return [ResourceState.Dirty];
    }
}
