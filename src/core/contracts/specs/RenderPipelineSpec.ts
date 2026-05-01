import type { ColorTargetSpec } from '../pipeline/ColorTargetSpec';
import type { DepthSpec } from '../pipeline/DepthSpec';
import type { MultisampleSpec } from '../pipeline/MultisampleSpec';
import type { VertexBufferLayout } from '../pipeline/VertexBufferLayout';
import type { PipelineSpec } from './PipelineSpec';
import type { ShaderModuleSpec } from './ShaderModuleSpec';

/**
 * Configuração de primitive assembly do render pipeline. Mapeia direto
 * pra `GPURenderPipelineDescriptor.primitive`.
 */
export interface PrimitiveSpec {
    /** Topologia do índice (triangle-list, line-list, etc.). Default: 'triangle-list'. */
    readonly topology?: GPUPrimitiveTopology;
    /** Format do index buffer quando topology é 'triangle-strip' ou 'line-strip'. */
    readonly stripIndexFormat?: GPUIndexFormat;
    /** Winding considerado front-face. Default: 'ccw'. */
    readonly frontFace?: GPUFrontFace;
    /** Quais faces descartar antes do raster. Default: 'none'. */
    readonly cullMode?: GPUCullMode;
    /** Se true, desabilita clipping em depth (útil para shadow volumes). */
    readonly unclippedDepth?: boolean;
}

/**
 * Vertex stage do render pipeline — shader + entry point + vertex buffer
 * layouts. Vertex shaders escrevem `@builtin(position)` e atributos
 * `@location(N)` consumidos pelo fragment.
 */
export interface VertexStage {
    /** Shader module spec contendo a função vertex. */
    readonly shader: ShaderModuleSpec;
    /** Nome da função `@vertex` no WGSL. */
    readonly entryPoint: string;
    /** Layouts dos vertex buffers (stride + atributos). Default: vertex pulled from buffer attribs. */
    readonly buffers?: readonly VertexBufferLayout[];
    /** Override constants WGSL (`override foo: f32 = 1.0`). */
    readonly constants?: Readonly<Record<string, number>>;
}

/**
 * Fragment stage do render pipeline — shader + entry point + color targets.
 * Fragment shaders leem atributos do vertex e escrevem `@location(N)` em
 * cada color target ativo.
 */
export interface FragmentStage {
    /** Shader module spec contendo a função fragment. */
    readonly shader: ShaderModuleSpec;
    /** Nome da função `@fragment` no WGSL. */
    readonly entryPoint: string;
    /** Color targets de saída (format + blend + writeMask). Múltiplos = MRT. */
    readonly targets: readonly ColorTargetSpec[];
    /** Override constants WGSL. */
    readonly constants?: Readonly<Record<string, number>>;
}

/**
 * Spec de render pipeline GPU — vertex + fragment + primitive + depth/multisample.
 * Materializado por `core.create<RenderPipelineSpec>()` em GPURenderPipeline.
 *
 * Use `core.createAsync` para compilação não-bloqueante (recomendado para
 * pipelines pesados como Forward com shadow PCF + 4 cascades).
 */
export interface RenderPipelineSpec extends PipelineSpec {
    readonly subkind: 'render';
    readonly vertex: VertexStage;
    /** Opcional para pipelines depth-only (e.g. shadow map vs. light POV). */
    readonly fragment?: FragmentStage;
    readonly primitive?: PrimitiveSpec;
    /** Depth-stencil attachment config. Omitir = sem depth test. */
    readonly depthStencil?: DepthSpec;
    /** MSAA count + alpha-to-coverage. Default: 1× sem alpha-to-coverage. */
    readonly multisample?: MultisampleSpec;
}
