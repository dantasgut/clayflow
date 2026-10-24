// Imagens dos smokes: comparação pixel a pixel, PNG ↔ ImageData e as duas medidas de brilho (spec 037): a luma dos
// valores sRGB de 8 bits (`lumaSrgb`, sem decodificar — a medida do que se vê na tela) e a luminância de luz linear
// (`luminanceLinear`, dos alvos HDR). Os pesos são os Rec.709 da referência única (`elements/math/reference/color`).
import { luminance } from '../../elements/math/reference/color';

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

/** Luma Rec.709 (0–1) dos valores sRGB de 8 bits a partir do índice `i` (RGBA; BGRA com `bgra`). */
export function lumaSrgb8(data: ArrayLike<number>, i: number, bgra = false): number {
    return luminance([data[i + (bgra ? 2 : 0)]!, data[i + 1]!, data[i + (bgra ? 0 : 2)]!]) / 255;
}

/** Luma Rec.709 (0–1) do pixel, dos valores sRGB de 8 bits. */
export function lumaSrgb(img: ImageData, x: number, y: number): number {
    return lumaSrgb8(img.data, (y * img.width + x) * 4);
}

/** Luminância Rec.709 de luz linear (os valores HDR). */
export const luminanceLinear = (c: ArrayLike<number>): number => luminance([c[0]!, c[1]!, c[2]!]);
