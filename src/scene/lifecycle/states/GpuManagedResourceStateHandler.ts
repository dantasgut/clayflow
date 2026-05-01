import { ResourceState } from '../../contracts/ResourceState';
import type { ResourceStateHandler } from '../ResourceStateHandler';

export class GpuManagedResourceStateHandler implements ResourceStateHandler {
    readonly stateId = ResourceState.GpuManaged;
    canRender(): boolean {
        return true;
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
        return true;
    }
    ignoreDirtyMark(): boolean {
        return true;
    }
    validTransitions(): readonly ResourceState[] {
        return [ResourceState.Ready, ResourceState.Disposed];
    }
}
