import type {
    BindGroupSpec,
    ComputeKernel,
    ComputeKernelOptions,
    ComputePipelineSpec,
    EngineCore,
    LayoutSpec,
    ShaderModuleSpec,
} from '../../core/contracts/index';
import { validateWgslReferences } from './validateWgslReferences';

export type {
    ComputeKernel,
    ComputeKernelBinding,
    ComputeKernelBindingType,
    ComputeKernelOptions,
} from '../../core/contracts/index';

/**
 * Encapsula a sequência shader + layout + bindgroup + pipeline em 1 chamada
 * idempotente (cache por specHash via core.create). Reduz boilerplate em flows
 * que criam compute kernels paramétricos.
 *
 * O shader source é validado por uma regex que procura chamadas a funções
 * `fn xxx()` não-definidas (catch barato para concatenações WGSL incompletas,
 * e.g. helpers ausentes em base sources). O custo é microsegundos no startup.
 */
export function createComputeKernel(core: EngineCore, opts: ComputeKernelOptions): ComputeKernel {
    validateWgslReferences(opts.shaderSource, `kernel "${opts.discriminator}"`);
    const layout = core.create<LayoutSpec>({
        kind: 'layout',
        discriminator: `${opts.discriminator}_layout`,
        entries: opts.bindings.map((b) => ({
            binding: b.binding,
            visibility: GPUShaderStage.COMPUTE,
            kind: 'buffer' as const,
            type: b.type,
        })),
    });
    const shader = core.create<ShaderModuleSpec>({
        kind: 'shader',
        discriminator: `${opts.discriminator}_shader`,
        source: opts.shaderSource,
    });
    const pipelineSpec: ComputePipelineSpec = {
        kind: 'pipeline',
        subkind: 'compute',
        discriminator: `${opts.discriminator}_pipeline`,
        layouts: [layout],
        shader,
        entryPoint: opts.entryPoint,
    };
    if (opts.preferAsync === true) {
        void core.createAsync<ComputePipelineSpec>(pipelineSpec);
    } else {
        core.create<ComputePipelineSpec>(pipelineSpec);
    }
    const bindGroup = core.create<BindGroupSpec>({
        kind: 'bindgroup',
        discriminator: `${opts.discriminator}_bg`,
        layout,
        bindings: opts.bindings.map((b) => ({
            binding: b.binding,
            kind: 'buffer' as const,
            buffer: b.buffer,
        })),
    });
    return { pipeline: pipelineSpec, bindGroup, layout };
}
