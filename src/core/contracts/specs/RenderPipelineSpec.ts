import type { ColorTargetSpec } from '../pipeline/ColorTargetSpec';
import type { DepthSpec } from '../pipeline/DepthSpec';
import type { MultisampleSpec } from '../pipeline/MultisampleSpec';
import type { VertexBufferLayout } from '../pipeline/VertexBufferLayout';
import type { PipelineSpec } from './PipelineSpec';
import type { ShaderModuleSpec } from './ShaderModuleSpec';

export interface PrimitiveSpec {
    readonly topology?: GPUPrimitiveTopology;
    readonly stripIndexFormat?: GPUIndexFormat;
    readonly frontFace?: GPUFrontFace;
    readonly cullMode?: GPUCullMode;
    readonly unclippedDepth?: boolean;
}

export interface VertexStage {
    readonly shader: ShaderModuleSpec;
    readonly entryPoint: string;
    readonly buffers?: readonly VertexBufferLayout[];
    readonly constants?: Readonly<Record<string, number>>;
}

export interface FragmentStage {
    readonly shader: ShaderModuleSpec;
    readonly entryPoint: string;
    readonly targets: readonly ColorTargetSpec[];
    readonly constants?: Readonly<Record<string, number>>;
}

export interface RenderPipelineSpec extends PipelineSpec {
    readonly subkind: 'render';
    readonly vertex: VertexStage;
    readonly fragment?: FragmentStage;
    readonly primitive?: PrimitiveSpec;
    readonly depthStencil?: DepthSpec;
    readonly multisample?: MultisampleSpec;
}
