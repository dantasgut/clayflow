import type {
    ColorTargetSpec,
    DepthSpec,
    MultisampleSpec,
    VertexBufferLayout,
} from '../../core/contracts/index';

export type PipelineDescriptorRole = 'compute' | 'render';

export interface PipelineDescriptor {
    readonly id: string;
    readonly role: PipelineDescriptorRole;
    readonly shaderSource: string;
    readonly entryPoints: readonly string[];
    readonly consumes: readonly string[];
    readonly topology?: GPUPrimitiveTopology;
    readonly cullMode?: GPUCullMode;
    readonly frontFace?: GPUFrontFace;
    readonly depth?: DepthSpec;
    readonly multisample?: MultisampleSpec;
    readonly colorTargets?: readonly ColorTargetSpec[];
    readonly vertexBuffers?: readonly VertexBufferLayout[];
    readonly preferAsync?: boolean;
}
