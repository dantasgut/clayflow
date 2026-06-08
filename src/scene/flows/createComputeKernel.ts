import type {
    BindGroupSpec,
    ComputeKernel,
    ComputeKernelBindGroup,
    ComputeKernelBinding,
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
    ComputeKernelBindGroup,
    ComputeKernelOptions,
} from '../../core/contracts/index';

/**
 * Encapsula a sequência shader + layouts + bindgroups + pipeline em 1 chamada
 * idempotente (cache por specHash via core.create). Reduz boilerplate em flows
 * que criam compute kernels paramétricos.
 *
 * **Single-bindgroup** (atalho): use `opts.bindings`.
 * **Multi-bindgroup** (kernels com @group(0), @group(1)...): use `opts.bindGroups`.
 *
 * O shader source é validado por uma regex que procura chamadas a funções
 * `fn xxx()` não-definidas (catch barato para concatenações WGSL incompletas,
 * e.g. helpers ausentes em base sources). O custo é microsegundos no startup.
 */
export function createComputeKernel(core: EngineCore, opts: ComputeKernelOptions): ComputeKernel {
    validateWgslReferences(opts.shaderSource, `kernel "${opts.discriminator}"`);

    const groups = normalizeGroups(opts);
    if (groups.length === 0) {
        throw new Error(
            `createComputeKernel("${opts.discriminator}"): forneça 'bindings' ou 'bindGroups'.`,
        );
    }

    const layouts: LayoutSpec[] = groups.map((g, i) =>
        core.create<LayoutSpec>({
            kind: 'layout',
            discriminator: layoutDiscriminator(opts.discriminator, i, groups.length),
            entries: g.bindings.map((b) => ({
                binding: b.binding,
                visibility: GPUShaderStage.COMPUTE,
                kind: 'buffer' as const,
                type: b.type,
            })),
        }),
    );

    const shader = core.create<ShaderModuleSpec>({
        kind: 'shader',
        discriminator: `${opts.discriminator}_shader`,
        source: opts.shaderSource,
    });

    const pipelineSpec: ComputePipelineSpec = {
        kind: 'pipeline',
        subkind: 'compute',
        discriminator: `${opts.discriminator}_pipeline`,
        layouts,
        shader,
        entryPoint: opts.entryPoint,
    };
    if (opts.preferAsync === true) {
        void core.createAsync<ComputePipelineSpec>(pipelineSpec);
    } else {
        core.create<ComputePipelineSpec>(pipelineSpec);
    }

    const bindGroups: BindGroupSpec[] = groups.map((g, i) =>
        core.create<BindGroupSpec>({
            kind: 'bindgroup',
            discriminator: bgDiscriminator(opts.discriminator, i, groups.length),
            layout: layouts[i]!,
            bindings: g.bindings.map((b) => ({
                binding: b.binding,
                kind: 'buffer' as const,
                buffer: b.buffer,
            })),
        }),
    );

    return {
        pipeline: pipelineSpec,
        bindGroup: bindGroups[0]!,
        layout: layouts[0]!,
        bindGroups,
        layouts,
    };
}

function normalizeGroups(opts: ComputeKernelOptions): readonly ComputeKernelBindGroup[] {
    if (opts.bindGroups !== undefined) return opts.bindGroups;
    if (opts.bindings !== undefined) {
        const single: ComputeKernelBindGroup = { bindings: opts.bindings };
        return [single];
    }
    return [];
}

function layoutDiscriminator(prefix: string, idx: number, total: number): string {
    // Para kernels single-bindgroup, mantém o discriminator legacy (sem _0)
    // — preserva compatibilidade com flows já migrados (LCP/FEM/XPBD).
    return total === 1 ? `${prefix}_layout` : `${prefix}_layout_${idx}`;
}

function bgDiscriminator(prefix: string, idx: number, total: number): string {
    return total === 1 ? `${prefix}_bg` : `${prefix}_bg_${idx}`;
}

// Suppress unused import warning when only types are referenced internally.
void ((): ComputeKernelBinding | undefined => undefined);
