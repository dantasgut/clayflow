import type { StencilFaceState } from './StencilFaceState';

export interface DepthSpec {
    readonly format: GPUTextureFormat;
    readonly depthWriteEnabled?: boolean;
    readonly depthCompare?: GPUCompareFunction;
    readonly stencilFront?: StencilFaceState;
    readonly stencilBack?: StencilFaceState;
    readonly stencilReadMask?: number;
    readonly stencilWriteMask?: number;
    readonly depthBias?: number;
    readonly depthBiasSlopeScale?: number;
    readonly depthBiasClamp?: number;
}
