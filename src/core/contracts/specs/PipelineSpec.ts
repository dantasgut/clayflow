import type { LayoutSpec } from './LayoutSpec';

/**
 * Subtipo de pipeline GPU. Mapeia para `device.createComputePipeline`
 * ou `device.createRenderPipeline`.
 */
export type PipelineSubkind = 'compute' | 'render';

/**
 * Base interface de pipeline specs. Subclasses concretas
 * (`ComputePipelineSpec`, `RenderPipelineSpec`) adicionam shader + entry
 * point + (para render) vertex/fragment stages.
 *
 * `layouts` define o `pipelineLayout` — quais bindgroups o pipeline
 * espera nos slots `@group(0)`, `@group(1)`, etc.
 */
export interface PipelineSpec {
    readonly kind: 'pipeline';
    readonly subkind: PipelineSubkind;
    /** Discriminador semântico (e.g. 'lcp_predict_pipeline'). Parte do specHash. */
    readonly discriminator?: string;
    /** Label para debugging. */
    readonly label?: string;
    /**
     * Layouts dos bindgroups esperados pelo pipeline. `layouts[N]` corresponde
     * a `@group(N)` no WGSL. Ordem importa.
     */
    readonly layouts: readonly LayoutSpec[];
}
