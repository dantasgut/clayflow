import { ResourceState } from '../../contracts/ResourceState';
import type { ResourceStateHandler } from '../ResourceStateHandler';

export class UninitializedResourceStateHandler implements ResourceStateHandler {
    readonly stateId = ResourceState.Uninitialized;
    canRender(): boolean {
        return false;
    }
    needsAllocation(): boolean {
        return true;
    }
    needsUpdate(): boolean {
        return false;
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
        return [ResourceState.Loading];
    }
}
