// Medidas de imagem dos smokes da 011 (spec 011, T002): faixas, degraus de texel, cintilação, serrilhado de borda e a
// leitura dos valores lineares do alvo HDR da cena (`FrameTargets.color`, `rgba16float`). A leitura de volta é só do
// teste, no fim do caso.
import type { Application, StagingBufferSpec, TextureSpec } from 'clayflow';
import type { HdrImage, Rect } from './spectralMeasures';
import { lumaSrgb, luminanceLinear } from './images';

/** Decodifica um meio-float IEEE 754 (16 bits). */
export function halfToFloat(h: number): number {
    const s = h & 0x8000 ? -1 : 1;
    const e = (h >> 10) & 0x1f;
    const f = h & 0x3ff;
    if (e === 0) return s * Math.pow(2, -14) * (f / 1024);
    if (e === 31) return f === 0 ? s * Infinity : NaN;
    return s * Math.pow(2, e - 15) * (1 + f / 1024);
}

export type { HdrImage, Rect } from './spectralMeasures';

/** Valor RGB linear do pixel. */
export function hdrAt(img: HdrImage, x: number, y: number): [number, number, number] {
    const i = (y * img.width + x) * 4;
    return [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!];
}

/** Luminância linear (Rec. 709) do pixel HDR. */
export function hdrLuminance(img: HdrImage, x: number, y: number): number {
    return luminanceLinear(hdrAt(img, x, y));
}

/** Lê uma textura `rgba16float` (sem amostras) de volta como floats. */
export async function readHdrTexture(app: Application, texture: TextureSpec): Promise<HdrImage> {
    const { width, height } = texture;
    const bytesPerRow = Math.ceil((width * 8) / 256) * 256;
    const staging = app.core.create<StagingBufferSpec>({
        kind: 'buffer',
        subkind: 'staging',
        discriminator: `hdr_readback_${width}x${height}`,
        byteSize: bytesPerRow * height,
    });
    app.core.record('hdr-readback', (frame) => {
        frame.copyTextureToBuffer(texture, staging, { bytesPerRow, rowsPerImage: height }, [
            width,
            height,
        ]);
    });
    app.core.submit();
    const raw = new Uint16Array(await app.core.readback(staging));
    app.core.destroy(staging);
    const data = new Float32Array(width * height * 4);
    const stride = bytesPerRow / 2;
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width * 4; x++)
            data[y * width * 4 + x] = halfToFloat(raw[y * stride + x]!);
    return { width, height, data };
}

/** Faixas numa sequência de níveis de código: o maior passo entre vizinhos e a sequência igual mais longa. */
export function banding(levels: readonly number[]): { maxStep: number; longestRun: number } {
    let maxStep = 0;
    let longestRun = 1;
    let run = 1;
    for (let i = 1; i < levels.length; i++) {
        const step = Math.abs(levels[i]! - levels[i - 1]!);
        maxStep = Math.max(maxStep, step);
        run = step === 0 ? run + 1 : 1;
        longestRun = Math.max(longestRun, run);
    }
    return { maxStep, longestRun };
}

/** Níveis de código (0–255) de um canal ao longo da linha `y`, entre `x0` e `x1`. */
export function rowLevels(
    img: ImageData,
    y: number,
    x0: number,
    x1: number,
    channel = 1,
): number[] {
    const out: number[] = [];
    for (let x = x0; x < x1; x++) out.push(img.data[(y * img.width + x) * 4 + channel]!);
    return out;
}

/**
 * Platôs de texel com borda reta: blocos de pelo menos `size`×`size` pixels de valor igual (8 bits) cujas bordas
 * esquerda e direita se repetem na mesma coluna em todas as linhas do bloco — a assinatura de um texel ampliado por
 * leitura bilinear ou mais próxima. Uma reconstrução contínua não produz nenhum.
 */
export function texelPlateaus(img: ImageData, rect: Rect, size: number, channel = 1): number {
    const at = (x: number, y: number): number => img.data[(y * img.width + x) * 4 + channel]!;
    let count = 0;
    for (let y = rect.y; y + size <= rect.y + rect.h; y += size) {
        let x = rect.x;
        while (x < rect.x + rect.w - size) {
            const v = at(x, y);
            let end = x + 1;
            while (end < rect.x + rect.w && at(end, y) === v) end++;
            const len = end - x;
            if (len >= size && v > 8) {
                let aligned = true;
                for (let k = 1; k < size && aligned; k++) {
                    for (let i = x; i < end && aligned; i++)
                        if (at(i, y + k) !== v) aligned = false;
                    if (x > rect.x && at(x - 1, y + k) === v) aligned = false;
                    if (end < rect.x + rect.w && at(end, y + k) === v) aligned = false;
                }
                if (aligned) count++;
            }
            x = end;
        }
    }
    return count;
}

/** Variância temporal média da luminância (8 bits, 0–1) por pixel numa região, ao longo dos quadros. */
export function temporalVariance(frames: readonly ImageData[], rect: Rect): number {
    let total = 0;
    let n = 0;
    for (let y = rect.y; y < rect.y + rect.h; y++) {
        for (let x = rect.x; x < rect.x + rect.w; x++) {
            let sum = 0;
            let sum2 = 0;
            for (const f of frames) {
                const l = lumaSrgb(f, x, y);
                sum += l;
                sum2 += l * l;
            }
            const mean = sum / frames.length;
            total += sum2 / frames.length - mean * mean;
            n++;
        }
    }
    return n === 0 ? 0 : total / n;
}

/**
 * Energia de alta frequência nas bordas: média de |laplaciano| da luminância nos pixels onde o gradiente passa de
 * `edge` (as silhuetas de alto contraste). Serrilhado de borda aumenta essa energia.
 */
export function edgeEnergy(img: ImageData, rect: Rect, edge = 0.25): number {
    const lum = (x: number, y: number): number => lumaSrgb(img, x, y);
    let total = 0;
    let n = 0;
    for (let y = rect.y + 1; y < rect.y + rect.h - 1; y++) {
        for (let x = rect.x + 1; x < rect.x + rect.w - 1; x++) {
            const gx = lum(x + 1, y) - lum(x - 1, y);
            const gy = lum(x, y + 1) - lum(x, y - 1);
            if (Math.hypot(gx, gy) < edge) continue;
            const lap =
                4 * lum(x, y) - lum(x + 1, y) - lum(x - 1, y) - lum(x, y + 1) - lum(x, y - 1);
            total += Math.abs(lap);
            n++;
        }
    }
    return n === 0 ? 0 : total / n;
}
