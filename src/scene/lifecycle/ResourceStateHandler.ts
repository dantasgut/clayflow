import { ResourceState } from '../contracts/ResourceState';

export interface ResourceStateHandler {
    readonly stateId: ResourceState;
    canRender(): boolean;
    needsAllocation(): boolean;
    needsUpdate(): boolean;
    needsDisposal(): boolean;
    suppressCpuUpload(): boolean;
    ignoreDirtyMark(): boolean;
    validTransitions(): readonly ResourceState[];
}
