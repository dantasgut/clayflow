/**
 * Forma de uma textura declarada por um descritor (`role: 'texture' | 'storage-texture'`). A C2 aloca a textura e a
 * view com esta forma e as recria quando o canvas muda de tamanho (`sizeFromCanvas`).
 */
export interface TextureShape {
    /**
     * Formato dos texels. `'canvas'` usa o formato do canvas (`EngineCore.canvasFormat`), resolvido na alocação —
     * para alvos de cor que serão copiados ou compostos no canvas.
     */
    readonly format: GPUTextureFormat | 'canvas';
    /** Dimensão da textura. Default `'2d'`. */
    readonly dimension?: '1d' | '2d' | '3d';
    /** Largura em texels (ignorada com `sizeFromCanvas`). */
    readonly width?: number;
    /** Altura em texels (ignorada com `sizeFromCanvas`). */
    readonly height?: number;
    /** Camadas (2d-array) ou fatias (3d). Default 1. */
    readonly depthOrArrayLayers?: number;
    /** Níveis de mip. Default 1. */
    readonly mipLevelCount?: number;
    /** Amostras (MSAA). Default 1. */
    readonly sampleCount?: 1 | 4;
    /** Acesso de shader para `storage-texture`. Default `'write-only'`. */
    readonly access?: 'write-only' | 'read-only' | 'read-write';
    /** Dimensão da view. Default: a da textura. */
    readonly viewDimension?: GPUTextureViewDimension;
    /** Tamanho igual ao do canvas; recriada a cada `canvasReconfigured`. */
    readonly sizeFromCanvas?: boolean;
}
