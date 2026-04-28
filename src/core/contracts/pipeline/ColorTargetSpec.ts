import type { BlendSpec } from './BlendSpec';

export interface ColorTargetSpec {
    readonly format: GPUTextureFormat;
    readonly blend?: BlendSpec;
    readonly writeMask?: number;
}
