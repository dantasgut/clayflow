/**
 * Heightmap carregado — array de alturas normalizadas (0..1) em layout
 * row-major `heights[y*width + x]`. Apps usam para gerar terrain meshes
 * via `ParametricGeometry` ou displacement mapping.
 */
export interface Heightmap {
    /** Largura em texels. */
    readonly width: number;
    /** Altura em texels. */
    readonly height: number;
    /** Float32Array com width × height alturas (canal R do PNG, normalizado 0..1). */
    readonly heights: Float32Array;
}

/**
 * HeightmapLoader carrega imagens (PNG/JPG) e extrai o canal R como
 * altura normalizada. 8-bit precision (256 níveis distintos). Para
 * heightmaps de alta resolução use 16-bit PNG ou EXR (não-suportado
 * neste loader — usar TextureLoader + decode manual).
 */
export class HeightmapLoader {
    /** Carrega heightmap via fetch + decode + extração canal R. */
    async load(url: string): Promise<Heightmap> {
        const response = await fetch(url);
        const blob = await response.blob();
        const bmp = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(bmp.width, bmp.height);
        const ctx = canvas.getContext('2d');
        if (ctx === null) throw new Error('HeightmapLoader: 2d context unavailable');
        ctx.drawImage(bmp, 0, 0);
        const data = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
        const heights = new Float32Array(bmp.width * bmp.height);
        for (let i = 0; i < heights.length; i++) {
            heights[i] = (data[i * 4] ?? 0) / 255;
        }
        return { width: bmp.width, height: bmp.height, heights };
    }
}
