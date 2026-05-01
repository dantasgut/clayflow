import type { PipelineSpec } from './PipelineSpec';
import type { ShaderModuleSpec } from './ShaderModuleSpec';

/**
 * Spec de compute pipeline GPU — shader module + entry point + override
 * constants. Materializado em GPUComputePipeline via
 * `device.createComputePipeline({...})` ou `createComputePipelineAsync`.
 *
 * O entry point é a função `@compute @workgroup_size(...)` no WGSL.
 * Override constants permitem parametrizar o shader sem recompile
 * (e.g. workgroup size dinâmico via `override WG_SIZE: u32 = 64`).
 */
export interface ComputePipelineSpec extends PipelineSpec {
    readonly subkind: 'compute';
    /** Shader module contendo a função compute. */
    readonly shader: ShaderModuleSpec;
    /** Nome da função `@compute @workgroup_size(...)`. */
    readonly entryPoint: string;
    /** Override constants WGSL (`override foo: f32 = 1.0`). */
    readonly constants?: Readonly<Record<string, number>>;
}
