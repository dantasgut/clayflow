import { ResourceState } from '../../contracts/ResourceState';
import type { ResourceStateHandler } from '../ResourceStateHandler';

export class DirtyResourceStateHandler implements ResourceStateHandler {
    readonly stateId = ResourceState.Dirty;
    canRender(): boolean {
        return false;
    }
    needsAllocation(): boolean {
        return false;
    }
    needsUpdate(): boolean {
        return true;
    }
    needsDisposal(): boolean {
        return false;
    }
    suppressCpuUpload(): boolean {
        return false;
    }
    ignoreDirtyMark(): boolean {
        return true;
    }
    validTransitions(): readonly ResourceState[] {
        return [ResourceState.Ready];
    }
}
