import type { PipelineSpec } from './PipelineSpec';
import type { ShaderModuleSpec } from './ShaderModuleSpec';

export interface ComputePipelineSpec extends PipelineSpec {
    readonly subkind: 'compute';
    readonly shader: ShaderModuleSpec;
    readonly entryPoint: string;
    readonly constants?: Readonly<Record<string, number>>;
}
