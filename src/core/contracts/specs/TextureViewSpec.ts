import type { TextureSpec } from './TextureSpec';

/**
 * View sobre uma `TextureSpec`. WebGPU exige views (não a texture diretamente)
 * em quase todos os bindings (render attachments, sampled textures em shader,
 * storage textures). Uma textura pode ter múltiplas views com formatos/aspects/
 * subresources distintos.
 */
export interface TextureViewSpec {
    /** Discriminador de tipo — sempre `'textureview'`. */
    readonly kind: 'textureview';
    /** Discriminador semântico (parte do specHash). */
    readonly discriminator?: string;
    /** Label para debugging (DevTools/RenderDoc). */
    readonly label?: string;
    /** Texture-fonte sobre a qual a view é construída. */
    readonly source: TextureSpec;
    /** Dimensão da view ('2d', '2d-array', 'cube', etc.). Default: derivada da source. */
    readonly dimension?: GPUTextureViewDimension;
    /** Format override (deve estar em source.viewFormats). Default: source.format. */
    readonly format?: GPUTextureFormat;
    /** Primeiro mip level visível na view. Default: 0. */
    readonly baseMipLevel?: number;
    /** Quantos mips a view enxerga a partir de baseMipLevel. Default: todos. */
    readonly mipLevelCount?: number;
    /** Primeiro array layer visível. Default: 0. */
    readonly baseArrayLayer?: number;
    /** Quantos layers a view enxerga. Default: todos. */
    readonly arrayLayerCount?: number;
    /**
     * Subresource aspect:
     *   - `all` (default): cobre depth+stencil em formats combinados.
     *   - `depth-only` / `stencil-only`: para bindings que precisam de um deles.
     */
    readonly aspect?: 'all' | 'depth-only' | 'stencil-only';
}
