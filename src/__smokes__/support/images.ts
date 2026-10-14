// Imagens dos smokes: comparação pixel a pixel, PNG ↔ ImageData e luminância.

/** Pixels distintos e maior diferença de canal entre duas imagens. */
export function diff(a: ImageData, b: ImageData): { pixels: number; max: number } {
    if (a.width !== b.width || a.height !== b.height) return { pixels: Infinity, max: 255 };
    let pixels = 0;
    let max = 0;
    for (let i = 0; i < a.data.length; i += 4) {
        let d = 0;
        for (let k = 0; k < 4; k++) d = Math.max(d, Math.abs(a.data[i + k]! - b.data[i + k]!));
        if (d > 0) pixels++;
        max = Math.max(max, d);
    }
    return { pixels, max };
}

export async function toPng(pixels: ImageData): Promise<Uint8Array> {
    const off = new OffscreenCanvas(pixels.width, pixels.height);
    off.getContext('2d')!.putImageData(pixels, 0, 0);
    const blob = await off.convertToBlob({ type: 'image/png' });
    return new Uint8Array(await blob.arrayBuffer());
}

export async function fromPng(bytes: Uint8Array): Promise<ImageData> {
    const bitmap = await createImageBitmap(new Blob([bytes.slice().buffer], { type: 'image/png' }));
    const off = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = off.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}

/** Luminância relativa (0–1) do pixel, dos valores sRGB de 8 bits. */
export function luminance(img: ImageData, x: number, y: number): number {
    const i = (y * img.width + x) * 4;
    return (0.2126 * img.data[i]! + 0.7152 * img.data[i + 1]! + 0.0722 * img.data[i + 2]!) / 255;
}
