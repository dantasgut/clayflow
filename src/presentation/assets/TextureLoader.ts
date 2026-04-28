export interface LoadedTexture {
    readonly width: number;
    readonly height: number;
    readonly bitmap: ImageBitmap;
}

export class TextureLoader {
    async load(url: string): Promise<LoadedTexture> {
        const response = await fetch(url);
        const blob = await response.blob();
        const bitmap = await createImageBitmap(blob);
        return { width: bitmap.width, height: bitmap.height, bitmap };
    }
}
