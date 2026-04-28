export interface Heightmap {
    readonly width: number;
    readonly height: number;
    readonly heights: Float32Array;
}

export class HeightmapLoader {
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
