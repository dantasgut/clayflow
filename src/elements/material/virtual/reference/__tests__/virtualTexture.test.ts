import { describe, expect, it } from 'vitest';
import { srgbDecode } from '../../../../math/reference/color';
import vtCommonSource from '../../../../gpu/wgsl/virtual/vt_common.wgsl?raw';
import vtPrepareSource from '../../../../gpu/wgsl/virtual/vt_prepare.wgsl?raw';
import {
    VT_MAX_LEVELS as ENGINE_MAX_LEVELS,
    VT_PAGE_BORDER as ENGINE_BORDER,
    VT_PAGE_PAYLOAD as ENGINE_PAYLOAD,
    VT_PAGE_STRIDE as ENGINE_STRIDE,
    VT_PREP_BLOCK,
    VT_PREP_LEVELS,
    vtLevelCount,
    vtPagesOfLevel,
    vtPrepOffset,
    vtSizeOfLevel,
} from '../../layout';
import { VirtualImage } from '../../VirtualImage';
import {
    VT_AVERAGE_WORD,
    VT_HEADER,
    VT_READY_WORD,
    VT_PENDING,
    VT_PHYS_MASK,
    VT_PREAMBLE,
    VT_RESIDENT,
    VirtualTextures,
} from '../../VirtualTextures';
import {
    VT_MAX_LEVELS,
    VT_PAGE_BORDER,
    VT_PAGE_PAYLOAD,
    VT_PAGE_STRIDE,
    vtAllocate,
    vtLevelBases,
    vtLevelPages,
    vtLevelSize,
    vtLevels,
    vtLod,
    vtPageOf,
    vtPageTexels,
    vtPyramid,
    vtSample,
    vtSampleLevel,
    type VirtualPyramid,
    type VirtualWrap,
} from '../virtualTexture';

// Texturas virtuais (spec 034, T060c): a referência f64 (disposição, pirâmide, páginas, nível, leitura direta, ordem da
// alocação) e a leitura pelas páginas com borda — o caminho do nó (`image.wgsl`) — igual à leitura direta.

/** Imagem RGBA8 sRGB de teste: um padrão sem periodicidade curta. */
function picture(w: number, h: number): Uint8Array {
    const p = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const o = (y * w + x) * 4;
            p[o] = (x * 37 + y * 11) & 255;
            p[o + 1] = (x * 5 + y * 53) & 255;
            p[o + 2] = (x * y + 17) & 255;
            p[o + 3] = 255 - ((x + y) & 63);
        }
    return p;
}

/** A leitura de um nível pela página com borda (o caminho do nó): o bilinear dentro dos texels da página. */
function samplePage(
    pyr: VirtualPyramid,
    level: number,
    u: number,
    v: number,
    wrap: VirtualWrap,
): number[] {
    const { width, height } = pyr;
    const page = vtPageOf(width, height, level, u, v) - vtLevelBases(width, height).bases[level]!;
    const [nx] = vtLevelPages(width, height, level);
    const px = page % nx;
    const py = Math.floor(page / nx);
    const texels = vtPageTexels(pyr, level, px, py, wrap);
    const lw = Math.max(1, width >> level);
    const lh = Math.max(1, height >> level);
    // A posição no atlas: a borda e a posição no nível menos o começo da página (centros em i + ½).
    const ax = VT_PAGE_BORDER + (u * lw - px * VT_PAGE_PAYLOAD) - 0.5;
    const ay = VT_PAGE_BORDER + (v * lh - py * VT_PAGE_PAYLOAD) - 0.5;
    const x0 = Math.floor(ax);
    const y0 = Math.floor(ay);
    const fx = ax - x0;
    const fy = ay - y0;
    const at = (x: number, y: number, c: number): number => {
        const b = texels[(y * VT_PAGE_STRIDE + x) * 4 + c]!;
        return c === 3 || pyr.colorSpace === 'linear' ? b / 255 : srgbDecode(b / 255);
    };
    return [0, 1, 2, 3].map(
        (c) =>
            (at(x0, y0, c) * (1 - fx) + at(x0 + 1, y0, c) * fx) * (1 - fy)
            + (at(x0, y0 + 1, c) * (1 - fx) + at(x0 + 1, y0 + 1, c) * fx) * fy,
    );
}

describe('texturas virtuais: a referência (spec 034, T060c)', () => {
    it('disposição: níveis até 1 × 1, páginas de 120 por nível, bases em ordem', () => {
        expect(vtLevels(4096, 4096)).toBe(13);
        expect(vtLevels(300, 7)).toBe(9);
        expect(vtLevelPages(4096, 4096, 0)).toEqual([35, 35]);
        expect(vtLevelPages(4096, 4096, 5)).toEqual([2, 2]);
        expect(vtLevelPages(4096, 4096, 6)).toEqual([1, 1]);
        const { bases, total } = vtLevelBases(4096, 4096);
        expect(bases.slice(0, 3)).toEqual([0, 1225, 1225 + 324]);
        expect(total).toBe(bases[12]! + 1);
        expect(VT_PAGE_STRIDE).toBe(128);
        expect(vtLevels(1 << (VT_MAX_LEVELS - 1), 1)).toBe(VT_MAX_LEVELS);
    });

    it('as constantes do WGSL são as da referência', () => {
        const value = (name: string): number => {
            const m = new RegExp(`const ${name}: u32 = (0x[0-9A-Fa-f]+|\\d+)u;`).exec(
                vtCommonSource,
            );
            if (m === null) throw new Error(name);
            return Number(m[1]);
        };
        expect(value('VT_PAYLOAD')).toBe(VT_PAGE_PAYLOAD);
        expect(value('VT_BORDER')).toBe(VT_PAGE_BORDER);
        expect(value('VT_STRIDE')).toBe(VT_PAGE_STRIDE);
        expect(value('VT_MAX_LEVELS')).toBe(VT_MAX_LEVELS);
        expect(value('VT_PREAMBLE')).toBe(VT_PREAMBLE);
        expect(value('VT_HEADER')).toBe(VT_HEADER);
        expect(value('VT_PHYS_MASK')).toBe(VT_PHYS_MASK);
        expect(value('VT_RESIDENT')).toBe(VT_RESIDENT);
        expect(value('VT_PENDING')).toBe(VT_PENDING);
        expect(value('VT_READY_WORD')).toBe(VT_READY_WORD);
    });

    it('pirâmide: a média 2 × 2 em luz linear; a imagem constante fica constante', () => {
        const flat = new Uint8Array(64 * 32 * 4).fill(140);
        const pyr = vtPyramid(64, 32, flat);
        expect(pyr.levels.length).toBe(7);
        for (const level of pyr.levels) expect(level.every((b) => b === 140)).toBe(true);
        const two = new Uint8Array([0, 0, 0, 0, 255, 255, 255, 255]);
        const half = vtPyramid(2, 1, two).levels[1]!;
        // A média de preto e branco em luz linear (0,5) em sRGB: 188, não 128.
        expect(half[0]).toBe(188);
        expect(half[3]).toBe(128);
    });

    it('imagem linear: a média 2 × 2 sem curva e a leitura sem decodificar', () => {
        const two = new Uint8Array([0, 0, 0, 0, 255, 255, 255, 255]);
        const half = vtPyramid(2, 1, two, 'linear');
        expect(half.levels[1]![0]).toBe(128);
        const pyr = vtPyramid(64, 64, picture(64, 64), 'linear');
        const level = pyr.levels[0]!;
        // No centro do texel (3, 5), o próprio valor / 255.
        const c = vtSampleLevel(pyr, 0, 3.5 / 64, 5.5 / 64, 'repeat');
        expect(c[0]).toBeCloseTo(level[(5 * 64 + 3) * 4]! / 255, 12);
        const linear = new VirtualImage({
            width: 64,
            height: 64,
            colorSpace: 'linear',
            wrap: 'clamp',
        });
        const vt = new VirtualTextures({ images: [linear] });
        expect(vt.data.words[VT_PREAMBLE + 4]).toBe(3);
    });

    it('página: o conteúdo e a borda dos vizinhos (repetida na volta, presa na borda)', () => {
        const pyr = vtPyramid(256, 200, picture(256, 200));
        const level = pyr.levels[0]!;
        const texel = (x: number, y: number): number => level[(y * 256 + x) * 4]!;
        const at = (t: Uint8Array, i: number, j: number): number =>
            t[(j * VT_PAGE_STRIDE + i) * 4]!;
        const repeat = vtPageTexels(pyr, 0, 0, 0, 'repeat');
        expect(at(repeat, VT_PAGE_BORDER, VT_PAGE_BORDER)).toBe(texel(0, 0));
        expect(at(repeat, 0, VT_PAGE_BORDER)).toBe(texel(252, 0));
        expect(at(repeat, VT_PAGE_BORDER, 0)).toBe(texel(0, 196));
        const clamp = vtPageTexels(pyr, 0, 0, 0, 'clamp');
        expect(at(clamp, 0, 0)).toBe(texel(0, 0));
        // A última página do nível 0 (x de 240 a 255): a borda direita passa do fim.
        const last = vtPageTexels(pyr, 0, 2, 0, 'repeat');
        expect(at(last, VT_PAGE_BORDER + 15, VT_PAGE_BORDER)).toBe(texel(255, 0));
        expect(at(last, VT_PAGE_BORDER + 16, VT_PAGE_BORDER)).toBe(texel(0, 0));
    });

    it('nível pelas derivadas: a pegada de um texel é o nível 0; quatro, o 2; preso no último', () => {
        expect(vtLod(1024, 1024, [1 / 1024, 0], [0, 1 / 1024])).toBeCloseTo(0, 12);
        expect(vtLod(1024, 1024, [4 / 1024, 0], [0, 1 / 1024])).toBeCloseTo(2, 12);
        expect(vtLod(1024, 512, [0, 0], [0, 2 / 512])).toBeCloseTo(1, 12);
        expect(vtLod(1024, 1024, [0.1, 0], [0, 0])).toBeCloseTo(Math.log2(102.4), 12);
        expect(vtLod(1024, 1024, [9, 0], [0, 0])).toBe(10);
    });

    it('a leitura pela página com borda é a leitura direta (todos os níveis, endereçamentos e codificações)', () => {
        let worst = 0;
        for (const space of ['srgb', 'linear'] as const)
            for (const wrap of ['repeat', 'clamp'] as const) {
                const pyr = vtPyramid(500, 260, picture(500, 260), space);
                for (let level = 0; level < pyr.levels.length; level++)
                    for (let k = 0; k < 400; k++) {
                        const u = ((k * 0.6180339887) % 1) * 0.9999;
                        const v = ((k * 0.7548776662) % 1) * 0.9999;
                        const direct = vtSampleLevel(pyr, level, u, v, wrap);
                        const paged = samplePage(pyr, level, u, v, wrap);
                        for (let c = 0; c < 4; c++)
                            worst = Math.max(worst, Math.abs(direct[c]! - paged[c]!));
                    }
            }
        expect(worst).toBeLessThan(1e-12);
    });

    it('trilinear: a mistura dos dois níveis em volta; no último nível, ele só', () => {
        const pyr = vtPyramid(256, 256, picture(256, 256));
        const d = 3 / 256;
        const lod = vtLod(256, 256, [d, 0], [0, d]);
        const l0 = Math.floor(lod);
        const t = lod - l0;
        const a = vtSampleLevel(pyr, l0, 0.3, 0.7, 'repeat');
        const b = vtSampleLevel(pyr, l0 + 1, 0.3, 0.7, 'repeat');
        const c = vtSample(pyr, [1.3, -0.3], [d, 0], [0, d], 'repeat');
        for (let k = 0; k < 4; k++) expect(c[k]).toBeCloseTo(a[k]! + (b[k]! - a[k]!) * t, 12);
        const coarse = vtSample(pyr, [0.3, 0.7], [5, 0], [0, 5], 'repeat');
        expect(coarse).toEqual(vtSampleLevel(pyr, 8, 0.3, 0.7, 'repeat'));
    });

    it('alocação: do nível mais grosso ao mais fino, pelo índice, até o orçamento e as livres', () => {
        const needs = [
            { page: 9, level: 0 },
            { page: 3, level: 2 },
            { page: 1, level: 0 },
            { page: 7, level: 2 },
            { page: 5, level: 1 },
        ];
        expect(vtAllocate(needs, [40, 41, 42, 43, 44, 45], 4)).toEqual([
            [3, 40],
            [7, 41],
            [5, 42],
            [1, 43],
        ]);
        expect(vtAllocate(needs, [8, 9], 4)).toEqual([
            [3, 8],
            [7, 9],
        ]);
    });

    it('VirtualTextures: o preâmbulo, os cabeçalhos, a tabela zerada e a imagem e o nível de cada página', () => {
        const a = new VirtualImage({ width: 300, height: 130 });
        const b = new VirtualImage({ width: 64, height: 64, wrap: 'clamp' });
        const vt = new VirtualTextures({ images: [a] });
        expect(vt.addImage(b)).toBe(1);
        const w = vt.data.words;
        const tableStart = VT_PREAMBLE + 2 * VT_HEADER;
        expect([...w.slice(0, 4)]).toEqual([
            2,
            tableStart,
            a.pages + b.pages,
            tableStart + a.pages + b.pages,
        ]);
        const hb = VT_PREAMBLE + VT_HEADER;
        expect([w[hb], w[hb + 1], w[hb + 2], w[hb + 3], w[hb + 4], w[hb + 6]]).toEqual([
            64,
            64,
            7,
            a.pages,
            1,
            b.pages,
        ]);
        expect(w[hb + 7]).toBe(a.pages + b.bases[6]!);
        expect(w.slice(tableStart, tableStart + a.pages + b.pages).every((x) => x === 0)).toBe(
            true,
        );
        const info = tableStart + a.pages + b.pages;
        expect(w[info + a.bases[1]!]).toBe(0 | (1 << 16));
        expect(w[info + a.pages]).toBe(1);
        expect(a.locate(a.bases[1]! + 1)).toEqual({ level: 1, px: 1, py: 0 });
        expect(vt.data.totalPages).toBe(a.pages + b.pages);
        // A média e a marca de preparada: zeradas até a preparação; postas no lugar e levadas às disposições seguintes.
        expect([w[hb + VT_AVERAGE_WORD], w[hb + VT_READY_WORD]]).toEqual([0, 0]);
        expect(vt.averageOf(b)).toBeUndefined();
        expect(vt.setPrepared(1, 0x80402010)).toEqual([
            [hb + VT_AVERAGE_WORD, 0x80402010],
            [hb + VT_READY_WORD, 1],
        ]);
        expect(vt.averageOf(b)).toBe(0x80402010);
        vt.addImage(new VirtualImage({ width: 8, height: 8 }));
        const h2 = VT_PREAMBLE + VT_HEADER;
        expect([vt.data.words[h2 + VT_AVERAGE_WORD], vt.data.words[h2 + VT_READY_WORD]]).toEqual([
            0x80402010, 1,
        ]);
        expect(vt.data.words[VT_PREAMBLE + VT_READY_WORD]).toBe(0);
    });

    it('a disposição do motor (`layout.ts`, `VirtualImage`) é a da referência, escrita à parte', () => {
        const sizes: [number, number][] = [
            [1, 1],
            [2, 1],
            [7, 300],
            [120, 120],
            [121, 119],
            [3000, 2400],
            [4096, 4096],
            [32768, 3],
        ];
        expect([VT_PAGE_PAYLOAD, VT_PAGE_BORDER, VT_PAGE_STRIDE, VT_MAX_LEVELS]).toEqual([
            ENGINE_PAYLOAD,
            ENGINE_BORDER,
            ENGINE_STRIDE,
            ENGINE_MAX_LEVELS,
        ]);
        for (const [w, h] of sizes) {
            const img = new VirtualImage({ width: w, height: h });
            expect(img.levels).toBe(vtLevels(w, h));
            expect(vtLevelCount(w, h)).toBe(vtLevels(w, h));
            const { bases, total } = vtLevelBases(w, h);
            expect(img.bases).toEqual(bases);
            expect(img.pages).toBe(total);
            for (let l = 0; l < img.levels; l++) {
                expect(vtSizeOfLevel(w, h, l)).toEqual(vtLevelSize(w, h, l));
                expect(vtPagesOfLevel(w, h, l)).toEqual(vtLevelPages(w, h, l));
            }
        }
    });

    it('preparação: a saída de um bloco tem os níveis 1 a 10 do bloco de 1024², um após o outro', () => {
        expect(VT_PREP_BLOCK).toBe(1 << VT_PREP_LEVELS);
        expect(vtPrepOffset(1)).toBe(0);
        expect(vtPrepOffset(2)).toBe(512 * 512);
        let sum = 0;
        for (let k = 1; k <= VT_PREP_LEVELS; k++) sum += (VT_PREP_BLOCK >> k) ** 2;
        expect(vtPrepOffset(VT_PREP_LEVELS + 1)).toBe(sum);
        // As mesmas constantes no WGSL da preparação.
        expect(/const VT_PREP_BLOCK: u32 = (\d+)u;/.exec(vtPrepareSource)?.[1]).toBe(
            String(VT_PREP_BLOCK),
        );
        expect(/const VT_PREP_LEVELS: u32 = (\d+)u;/.exec(vtPrepareSource)?.[1]).toBe(
            String(VT_PREP_LEVELS),
        );
    });
});
