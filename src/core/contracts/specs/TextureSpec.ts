export interface TextureSpec {
    readonly kind: 'texture';
    readonly discriminator?: string;
    readonly label?: string;
    readonly dimension?: '1d' | '2d' | '3d';
    readonly width: number;
    readonly height: number;
    readonly depthOrArrayLayers?: number;
    readonly format: GPUTextureFormat;
    readonly usage: number;
    readonly mipLevelCount?: number;
    readonly sampleCount?: 1 | 4;
    readonly viewFormats?: readonly GPUTextureFormat[];
}
