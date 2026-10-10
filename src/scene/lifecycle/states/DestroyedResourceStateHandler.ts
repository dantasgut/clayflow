import { ResourceState } from '../../contracts/ResourceState';
import type { ResourceStateHandler } from '../ResourceStateHandler';

export class DestroyedResourceStateHandler implements ResourceStateHandler {
    readonly stateId = ResourceState.Destroyed;
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

    reportsIgnoredMutation(): boolean {
        return false;
    }
    validTransitions(): readonly ResourceState[] {
        // Reinserção após remoção: o recurso volta ao início do ciclo e é alocado de novo.
        return [ResourceState.Uninitialized];
    }
}
