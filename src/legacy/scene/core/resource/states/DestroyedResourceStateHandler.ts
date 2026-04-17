import type { ResourceStateHandler } from '../ResourceStateHandler';
import { ResourceState } from '../../ResourceState';

export class DestroyedResourceStateHandler implements ResourceStateHandler {
    public readonly stateId = ResourceState.Destroyed;

    canRender():         boolean { return false; }
    needsAllocation():   boolean { return false; }
    needsUpdate():       boolean { return false; }
    needsDisposal():     boolean { return false; }
    suppressCpuUpload(): boolean { return false; }
    ignoreDirtyMark():   boolean { return true;  }

    validTransitions(): readonly ResourceState[] {
        return [];
    }
}
