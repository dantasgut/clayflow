import { ResourceState } from '../../contracts/ResourceState';
import type { ResourceStateHandler } from '../ResourceStateHandler';

export class LoadingResourceStateHandler implements ResourceStateHandler {
    readonly stateId = ResourceState.Loading;
    canRender(): boolean {
        return false;
    }
    needsAllocation(): boolean {
        return false;
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
        return [ResourceState.Ready];
    }
}
