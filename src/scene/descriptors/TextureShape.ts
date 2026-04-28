export interface TextureShape {
    readonly format: GPUTextureFormat;
    readonly dimension?: '1d' | '2d' | '3d';
    readonly width?: number;
    readonly height?: number;
    readonly depthOrArrayLayers?: number;
    readonly mipLevelCount?: number;
    readonly sampleCount?: 1 | 4;
    readonly access?: 'write-only' | 'read-only' | 'read-write';
    readonly viewDimension?: GPUTextureViewDimension;
    readonly sizeFromCanvas?: boolean;
}
