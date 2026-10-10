import { type ResourceState } from '../contracts/ResourceState';

export interface ResourceStateHandler {
    readonly stateId: ResourceState;
    canRender(): boolean;
    needsAllocation(): boolean;
    needsUpdate(): boolean;
    needsDisposal(): boolean;
    suppressCpuUpload(): boolean;
    ignoreDirtyMark(): boolean;
    /**
     * `true` quando uma mutação ignorada neste estado é um erro de uso que merece aviso (a GPU é dona do dado —
     * `GpuManaged`); `false` quando ignorar é o comportamento normal (ex.: `Dirty`, já na fila de envio).
     */
    reportsIgnoredMutation(): boolean;
    validTransitions(): readonly ResourceState[];
}
