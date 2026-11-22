/**
 * Spec 041, R20 — o critério de nível das vistas da malha adaptativa contra a referência f64: na vista da luz, a malha
 * de cada retalho erra menos que `error` texels do nível do mapa de sombra virtual onde ele cai e nenhum segmento é menor
 * que `segment` texels; o nível do mapa é o do ponto do retalho mais perto da câmera no plano da luz; a histerese só
 * segura o nível mais fino; e a vista refaz só os retalhos que mudaram (ou cuja costura mudou).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    VIEW_HYSTERESIS,
    levelOf,
    lightSegments,
    patchRecords,
    redoPatches,
    svLevelOfBox,
    svTexel,
    viewLevel,
    type ShadowFrameRef,
} from '../reference/viewLod';

/** O mapa do perfil alto: 4096² por nível (32 páginas), primeiro nível de 1 m, 16 níveis. */
const MAP: ShadowFrameRef = {
    firstLevelRadius: 1,
    pagesPerLevel: 32,
    levels: 16,
    camera: [3.5, -2],
};

/** Erro máximo (f64, amostragem densa) da interpolação linear em `n` segmentos de `h` em [x0, x0 + span]. */
function chordError(h: (x: number) => number, x0: number, span: number, n: number): number {
    let worst = 0;
    const seg = span / n;
    for (let s = 0; s < n; s++) {
        const a = x0 + s * seg;
        const ha = h(a);
        const hb = h(a + seg);
        for (let t = 1; t < 64; t++) {
            const f = t / 64;
            worst = Math.max(worst, Math.abs(h(a + f * seg) - (ha + f * (hb - ha))));
        }
    }
    return worst;
}

describe('critério de nível da vista da luz (spec 041, R20)', () => {
    it('o nível do mapa da caixa é o do ponto mais perto da câmera (Chebyshev), igual ao de cada ponto pela força bruta', () => {
        const usable = MAP.firstLevelRadius * (1 - 4 / MAP.pagesPerLevel);
        const levelOfPoint = (x: number, y: number): number => {
            const d = Math.max(Math.abs(x - MAP.camera[0]), Math.abs(y - MAP.camera[1]));
            const k = Math.ceil(Math.log2(Math.max(d / usable, 1)));
            return Math.min(Math.max(k, 0), MAP.levels - 1);
        };
        let seed = 7;
        const rnd = (): number => {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return seed / 2 ** 32;
        };
        for (let i = 0; i < 500; i++) {
            const cx = (rnd() - 0.5) * 2 ** (rnd() * 16);
            const cy = (rnd() - 0.5) * 2 ** (rnd() * 16);
            const w = rnd() * 2 ** (rnd() * 10);
            const h = rnd() * 2 ** (rnd() * 10);
            const lo: [number, number] = [cx - w, cy - h];
            const hi: [number, number] = [cx + w, cy + h];
            let brute = Infinity;
            for (let a = 0; a <= 40; a++)
                for (let b = 0; b <= 40; b++)
                    brute = Math.min(
                        brute,
                        levelOfPoint(lo[0] + (a / 40) * 2 * w, lo[1] + (b / 40) * 2 * h),
                    );
            // A grade da força bruta pode não tocar o ponto mais perto: o nível da caixa nunca é mais grosso.
            const k = svLevelOfBox(MAP, lo, hi);
            expect(k).toBeLessThanOrEqual(brute);
            const nearest: [number, number] = [
                Math.min(Math.max(MAP.camera[0], lo[0]), hi[0]),
                Math.min(Math.max(MAP.camera[1], lo[1]), hi[1]),
            ];
            expect(k).toBe(levelOfPoint(nearest[0], nearest[1]));
        }
        // O texel dobra a cada nível: 4096 texels no lado de cada nível.
        expect(svTexel(MAP, 0)).toBeCloseTo(2 / 4096, 12);
        expect(svTexel(MAP, 10) / svTexel(MAP, 9)).toBeCloseTo(2, 12);
    });

    it('a malha do retalho erra menos que `error` texels do nível (o erro exato da interpolação, f64)', () => {
        const maxLevel = 6;
        let checked = 0;
        for (const [A, lambda] of [
            [22, 600],
            [3, 120],
            [0.5, 30],
            [0.05, 4],
        ] as const) {
            const k = (2 * Math.PI) / lambda;
            const h = (x: number): number => A * Math.sin(k * x + 0.3);
            // κ máximo da senoide (a cota que a amostragem do retalho estima).
            const kappa = A * k * k;
            for (const level of [2, 5, 8, 11, 14]) {
                const texel = svTexel(MAP, level);
                for (const L of [4, 16, 64, 256, 640]) {
                    const n = lightSegments({
                        worldSize: L,
                        kappa,
                        texel,
                        error: 0.5,
                        segment: 1,
                        maxLevel,
                    });
                    const l = levelOf(n, maxLevel);
                    const segments = 2 ** l;
                    const err = chordError(h, 17, L, segments);
                    const capped = n >= 2 ** maxLevel || L / segments < texel * 1.000001;
                    if (!capped) {
                        expect(err).toBeLessThanOrEqual(0.5 * texel * (1 + 1e-9));
                        checked++;
                    }
                    // Nenhum segmento abaixo de um texel (salvo o retalho inteiro menor que ele).
                    if (l > 0) expect(L / segments).toBeGreaterThanOrEqual(texel * 0.999999);
                }
            }
        }
        expect(checked).toBeGreaterThan(20);
    });

    it('um nível mais grosso do mapa pede menos segmentos (a vista longe da câmera é mais leve)', () => {
        const base = { worldSize: 256, kappa: 0.005, error: 0.5, segment: 1, maxLevel: 5 };
        let previous = Infinity;
        for (let k = 0; k < 16; k++) {
            const n = lightSegments({ ...base, texel: svTexel(MAP, k) });
            expect(n).toBeLessThanOrEqual(previous);
            previous = n;
        }
        expect(levelOf(lightSegments({ ...base, texel: svTexel(MAP, 13) }), 5)).toBeLessThan(5);
    });

    it('histerese: sobe na hora; desce só abaixo de 3/4 dos segmentos do nível de baixo', () => {
        expect(viewLevel(9, 5, 3)).toBe(4);
        expect(viewLevel(3.5, 5, 3)).toBe(3);
        expect(viewLevel(VIEW_HYSTERESIS * 4 + 0.01, 5, 3)).toBe(3);
        expect(viewLevel(VIEW_HYSTERESIS * 4 - 0.01, 5, 3)).toBe(2);
        expect(viewLevel(1, 5, undefined)).toBe(0);
        expect(viewLevel(32, 5, 5)).toBe(5);
    });

    it('a vista refaz só o retalho que mudou, a costura dele e os que ficaram com outra base', () => {
        const [p, q] = [4, 3];
        const levels = [2, 2, 3, 3, 1, 1, 2, 2, 0, 0, 1, 1];
        const before = patchRecords(levels);
        expect(redoPatches(p, q, before, before).every((r) => !r)).toBe(true);
        expect(redoPatches(p, q, before, undefined).every((r) => r)).toBe(true);
        // O retalho 6 sobe um nível: ele, os vizinhos (2, 5, 7, 10) e os de depois dele (bases deslocadas).
        const after = patchRecords(levels.map((l, i) => (i === 6 ? l + 1 : l)));
        const redo = redoPatches(p, q, after, before);
        expect(redo.map((r, i) => (r ? i : -1)).filter((i) => i >= 0)).toEqual([
            2, 5, 6, 7, 8, 9, 10, 11,
        ]);
    });

    it('os kernels usam as mesmas constantes da referência', () => {
        const dir = join(__dirname, '../../gpu/wgsl/kernels');
        const view = readFileSync(join(dir, 'surface_adapt_view.wgsl'), 'utf8');
        expect(view).toMatch(/const ADAPT_HYSTERESIS: f32 = 0\.75;/);
        expect(VIEW_HYSTERESIS).toBe(0.75);
        const light = readFileSync(join(dir, 'surface_adapt_light.wgsl'), 'utf8');
        expect(light).toMatch(/1\.0 - 4\.0 \/ f32\(m\.pagesPerLevel\)/);
        expect(light).toMatch(/8\.0 \* adapt\.view_error \* texel/);
        expect(light).toMatch(/adapt\.view_segment \* texel/);
    });
});
