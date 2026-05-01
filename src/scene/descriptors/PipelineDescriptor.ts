import type {
    ColorTargetSpec,
    DepthSpec,
    MultisampleSpec,
    VertexBufferLayout,
} from '../../core/contracts/index';

/**
 * Tipo de pipeline declarado por um Resource. `compute` para kernels GPGPU,
 * `render` para vertex+fragment passes.
 */
export type PipelineDescriptorRole = 'compute' | 'render';

/**
 * PipelineDescriptor declara um pipeline GPU que um Resource fornece.
 * Diferentemente de `ComputePipelineSpec`/`RenderPipelineSpec` (Camada 1
 * — diretamente materializável), o PipelineDescriptor é declarativo:
 * o `LayoutInferencer` parsa o WGSL e resolve `consumes` para gerar as
 * layouts/bindgroups antes de virar Spec.
 *
 * Usado tipicamente por Materials (StandardMaterial declara seu shader)
 * e Flows que querem expor pipelines ao sistema.
 */
export interface PipelineDescriptor {
    /** Identificador único do pipeline (e.g. 'pipeline_standard', 'pipeline_lcp_predict'). */
    readonly id: string;
    readonly role: PipelineDescriptorRole;
    /** WGSL source completo contendo todos os entry points listados. */
    readonly shaderSource: string;
    /** Nomes das funções `@compute`/`@vertex`/`@fragment` no source. */
    readonly entryPoints: readonly string[];
    /**
     * Schema names que este pipeline consome via `@group`/`@binding` no WGSL.
     * O LayoutInferencer resolve esses nomes contra o World+ResourceSystem
     * para gerar as bindings concretas (e.g. `consumes: ['Camera', 'Transform']`).
     */
    readonly consumes: readonly string[];
    /** Topologia da primitive (apenas render pipelines). Default: triangle-list. */
    readonly topology?: GPUPrimitiveTopology;
    /** Cull mode (apenas render). Default: 'none'. */
    readonly cullMode?: GPUCullMode;
    /** Front-face winding (apenas render). Default: 'ccw'. */
    readonly frontFace?: GPUFrontFace;
    /** Depth-stencil config (apenas render). Default: nenhum depth attachment. */
    readonly depth?: DepthSpec;
    /** Multisample config (apenas render). Default: count=1. */
    readonly multisample?: MultisampleSpec;
    /** Color targets (apenas render). Default: 1 target com canvas format. */
    readonly colorTargets?: readonly ColorTargetSpec[];
    /** Vertex buffer layouts (apenas render). Default: derivado de consumes. */
    readonly vertexBuffers?: readonly VertexBufferLayout[];
    /** Quando true, usa `core.createAsync` (compilação não-bloqueante). */
    readonly preferAsync?: boolean;
}
