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
    /**
     * Níveis de mip. Default 1. `'full'`: a cadeia completa até 1×1, calculada do tamanho na alocação (útil com
     * `sizeFromCanvas`, cujo tamanho muda).
     */
    readonly mipLevelCount?: number | 'full';
    /** Amostras (MSAA). Default 1. */
    readonly sampleCount?: 1 | 4;
    /** Acesso de shader para `storage-texture`. Default `'write-only'`. */
    readonly access?: 'write-only' | 'read-only' | 'read-write';
    /**
     * Textura de cor (`role: 'texture'`) também ligável como storage de leitura e escrita no mesmo despacho, quando o
     * device permite o formato assim (o `r32*` do núcleo; os da feature `texture-formats-tier2`): quem a compõe por
     * compute só onde há o que compor (spec 041, T074). Sem a permissão, a textura fica sem o uso — quem a lê confere o
     * uso da textura alocada (`GPUTextureUsage.STORAGE_BINDING`) e segue pelo passe de desenho.
     */
    readonly storage?: 'read-write';
    /** Dimensão da view. Default: a da textura. */
    readonly viewDimension?: GPUTextureViewDimension;
    /** Tamanho igual ao do canvas; recriada a cada `canvasReconfigured`. */
    readonly sizeFromCanvas?: boolean;
    /**
     * Com `sizeFromCanvas`: o canvas dividido por este fator, arredondado para cima (ex.: 8 = um texel por ladrilho de
     * 8 × 8 pixels). Default 1.
     */
    readonly canvasDivisor?: number;
}
