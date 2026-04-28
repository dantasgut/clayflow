import type { TextureSpec } from './TextureSpec';

export interface TextureViewSpec {
    readonly kind: 'textureview';
    readonly discriminator?: string;
    readonly label?: string;
    readonly source: TextureSpec;
    readonly dimension?: GPUTextureViewDimension;
    readonly format?: GPUTextureFormat;
    readonly baseMipLevel?: number;
    readonly mipLevelCount?: number;
    readonly baseArrayLayer?: number;
    readonly arrayLayerCount?: number;
    readonly aspect?: 'all' | 'depth-only' | 'stencil-only';
}
