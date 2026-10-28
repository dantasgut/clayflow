/**
 * Texture asset carregada — bitmap + dimensões. Apps usam o bitmap
 * para uploadar via `core.writeTexture(spec, bitmap, layout, size)`.
 */
export interface LoadedTexture {
    /** Largura em pixels. */
    readonly width: number;
    /** Altura em pixels. */
    readonly height: number;
    /** ImageBitmap (decodificado pelo browser). */
    readonly bitmap: ImageBitmap;
}

/**
 * TextureLoader carrega imagens (PNG, JPG, WebP, HDR) via fetch +
 * `createImageBitmap`. Decodificação é assíncrona e off-main-thread
 * (browsers modernos).
 */
export class TextureLoader {
    /** Carrega uma textura via fetch. Lança se URL não responde ou format não suportado. */
    async load(url: string): Promise<LoadedTexture> {
        const response = await fetch(url);
        const blob = await response.blob();
        const bitmap = await createImageBitmap(blob);
        return { width: bitmap.width, height: bitmap.height, bitmap };
    }
}
