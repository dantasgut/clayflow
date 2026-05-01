/**
 * Spec de uma GPU texture. Materializada por `core.create<TextureSpec>()`
 * em GPUTexture, indexada por specHash. Para criar uma view sobre a texture,
 * use `TextureViewSpec` referenciando o `source: TextureSpec`.
 *
 * `byteSize` no GpuResourceStore = `width × height × depth × bytesPerPixel(format)`,
 * somado por todos os mip levels e sample count.
 */
export interface TextureSpec {
    readonly kind: 'texture';
    /** Discriminador semântico (e.g. 'shadow_depth', 'forward_color:800x600'). */
    readonly discriminator?: string;
    /** Label para debugging (DevTools/RenderDoc). */
    readonly label?: string;
    /** Tipo de textura. Default: '2d'. */
    readonly dimension?: '1d' | '2d' | '3d';
    /** Largura em texels. */
    readonly width: number;
    /** Altura em texels. */
    readonly height: number;
    /**
     * Para 3D textures = depth slices. Para 2d-array = número de layers.
     * Default: 1 (2D simples).
     */
    readonly depthOrArrayLayers?: number;
    /** Formato pixel (e.g. 'rgba8unorm', 'depth32float'). */
    readonly format: GPUTextureFormat;
    /** Bitmask `GPUTextureUsage.*` (RENDER_ATTACHMENT, TEXTURE_BINDING, etc.). */
    readonly usage: number;
    /** Quantos mip levels alocar. Default: 1 (sem mipmaps). */
    readonly mipLevelCount?: number;
    /** MSAA: 1 (sem antialiasing) ou 4. Default: 1. */
    readonly sampleCount?: 1 | 4;
    /**
     * Formats adicionais permitidos para views sobre esta texture
     * (e.g. ['rgba8unorm-srgb'] para view sRGB de uma texture rgba8unorm).
     */
    readonly viewFormats?: readonly GPUTextureFormat[];
}
