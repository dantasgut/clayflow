import type { BindGroupSpec } from '../specs/BindGroupSpec';
import type { PipelineSpec } from '../specs/PipelineSpec';

export interface Binder<P extends PipelineSpec> {
    setPipeline(spec: P): this;
    setBindGroup(index: number, spec: BindGroupSpec, dynamicOffsets?: readonly number[]): this;
}
