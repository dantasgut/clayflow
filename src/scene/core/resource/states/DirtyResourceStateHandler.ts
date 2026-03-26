import type { ResourceStateHandler } from '../ResourceStateHandler';
import { ResourceState } from '../../ResourceState';

export class DirtyResourceStateHandler implements ResourceStateHandler {
    public readonly stateId = ResourceState.Dirty;

    canRender():         boolean { return false; }
    needsAllocation():   boolean { return false; }
    needsUpdate():       boolean { return true;  }
    needsDisposal():     boolean { return false; }
    suppressCpuUpload(): boolean { return false; }
    ignoreDirtyMark():   boolean { return true;  }

    validTransitions(): readonly ResourceState[] {
        return [ResourceState.Ready];
    }
}
