import type {
    BindGroupSpec,
    ComputeKernel,
    ComputeKernelBindGroup,
    ComputeKernelBinding,
    ComputePipelineSpec,
    EngineCore,
    LayoutSpec,
    ShaderModuleSpec,
} from '../../core/contracts/index';
import { composeWgsl } from '../shaders/composeWgsl';
import type { WgslModule } from '../shaders/WgslModule';

export type {
    ComputeKernel,
    ComputeKernelBinding,
    ComputeKernelBindingType,
    ComputeKernelBindGroup,
} from '../../core/contracts/index';

/**
 * Opções de `createComputeKernel`: módulo WGSL de entrada (montado por `composeWgsl`), entry point e bindgroups.
 *
 * Use **`bindings`** (single-bindgroup atalho) para casos simples (1 group).
 * Use **`bindGroups`** (multi-bindgroup) quando o kernel WGSL declara `@group(0)`, `@group(1)`, etc.
 */
export interface ComputeKernelOptions {
    /**
     * Prefixo único usado para gerar discriminator de cada artifact (`{prefix}_layout`, `{prefix}_pipeline`,
     * `{prefix}_bg`). Mesma string → mesmo specHash → reuso idempotente do GPU object.
     */
    readonly discriminator: string;
    /** Módulo de entrada; dependências e structs entram pela montagem (`composeWgsl`). */
    readonly shader: WgslModule;
    /** Nome da função `@compute @workgroup_size(...)`, definida no módulo de entrada. */
    readonly entryPoint: string;
    /** Single-bindgroup form (atalho). Use OU `bindings` OU `bindGroups`, não os dois. */
    readonly bindings?: readonly ComputeKernelBinding[];
    /** Multi-bindgroup form: `bindGroups[0]` → @group(0), [1] → @group(1)... */
    readonly bindGroups?: readonly ComputeKernelBindGroup[];
    /**
     * Se true, usa `core.createAsync` para compilar o pipeline em background (sem bloquear o frame). O Flow
     * consumidor deve checar `isReady()` ou tolerar que o pipeline ainda não esteja no store nos primeiros frames.
     */
    readonly preferAsync?: boolean;
}

/**
 * Encapsula a sequência shader + layouts + bindgroups + pipeline em 1 chamada
 * idempotente (cache por specHash via core.create). Reduz boilerplate em flows
 * que criam compute kernels paramétricos.
 *
 * **Single-bindgroup** (atalho): use `opts.bindings`.
 * **Multi-bindgroup** (kernels com @group(0), @group(1)...): use `opts.bindGroups`.
 *
 * O shader vem da montagem do módulo de entrada (`composeWgsl`: dependências, structs gerados, conflitos e
 * referências verificados; memorizada por módulo). Cada kernel recebe a sua cópia da spec montada — mesmo conteúdo,
 * mesmo objeto de GPU por dedup de conteúdo, posse independente em `destroyComputeKernel`.
 */
export function createComputeKernel(core: EngineCore, opts: ComputeKernelOptions): ComputeKernel {
    const composed = composeWgsl(opts.shader);
    if (!opts.shader.symbols.some((s) => s.kind === 'fn' && s.name === opts.entryPoint)) {
        throw new Error(
            `createComputeKernel("${opts.discriminator}"): entry point '${opts.entryPoint}' não é função do módulo '${opts.shader.name}'.`,
        );
    }

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
                ...(b.hasDynamicOffset === true ? { hasDynamicOffset: true } : {}),
            })),
        }),
    );

    const shader = core.create<ShaderModuleSpec>({ ...composed.spec });

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
                ...(b.size !== undefined ? { size: b.size } : {}),
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

/**
 * Libera a posse das specs criadas por `createComputeKernel` para `kernel`: bind groups, pipeline,
 * shader e layouts. Objetos de GPU compartilhados por conteúdo com outros kernels vivos continuam existindo (posse
 * por spec, `EngineCore.destroy`). Use ao substituir um kernel (crescimento de buffer, pool realocado) e no
 * descarte do Flow.
 */
export function destroyComputeKernel(core: EngineCore, kernel: ComputeKernel): void {
    for (const bindGroup of kernel.bindGroups) core.destroy(bindGroup);
    core.destroy(kernel.pipeline);
    core.destroy(kernel.pipeline.shader);
    for (const layout of kernel.layouts) core.destroy(layout);
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
