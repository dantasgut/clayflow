import type { ComputePipelineSpec } from '../specs/ComputePipelineSpec';
import type { Binder } from './Binder';
import type { Dispatcher } from './Dispatcher';

export interface ComputePass {
    readonly bind: Binder<ComputePipelineSpec>;
    readonly dispatch: Dispatcher;
    marker(label: string): void;
}
