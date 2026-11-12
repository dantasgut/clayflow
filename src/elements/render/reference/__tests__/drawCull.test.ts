import { describe, expect, it } from 'vitest';
import { mat4Apply, mat4Multiply, type Mat4, type Vec3 } from '../../../math/reference/xform';
import {
    buildHzb,
    compactGroups,
    frustumPlanes,
    HZB_HEIGHT,
    HZB_SPAN_MAX,
    HZB_WIDTH,
    hzbLevelOffset,
    hzbLevelSize,
    hzbLevels,
    hzbPixelRange,
    hzbWords,
    occluded,
    outsideFrustum,
    worldBox,
} from '../drawCull';

/** Perspectiva do WebGPU (profundidade em [0, 1], olhando para −z), em colunas. */
function perspective(fovY: number, aspect: number, near: number, far: number): number[] {
    const f = 1 / Math.tan(fovY / 2);
    const a = far / (near - far);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, a, -1, 0, 0, a * near, 0];
}

/** Câmera em `z = 5` olhando para a origem (a vista é a translação inversa). */
const VIEW: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -5, 1];
const VP = mat4Multiply(perspective(Math.PI / 3, 2, 0.1, 100), VIEW);

/** Profundidade de um alvo `w × h` com um plano de frente em `z` (mundo) cobrindo `[x0, x1] × [y0, y1]`. */
function wallDepth(
    w: number,
    h: number,
    z: number,
    rect: readonly [number, number, number, number],
): Float64Array {
    const depth = new Float64Array(w * h).fill(1);
    const clip = mat4Apply(VP, [0, 0, z, 1]);
    const d = clip[2]! / clip[3]!;
    const project = (x: number, y: number): [number, number] => {
        const c = mat4Apply(VP, [x, y, z, 1]);
        return [(c[0]! / c[3]! + 1) * 0.5 * w, (1 - c[1]! / c[3]!) * 0.5 * h];
    };
    const [px0, py0] = project(rect[0], rect[3]);
    const [px1, py1] = project(rect[2], rect[1]);
    for (let j = 0; j < h; j++)
        for (let i = 0; i < w; i++) {
            const cx = i + 0.5;
            const cy = j + 0.5;
            if (cx >= px0 && cx <= px1 && cy >= py0 && cy <= py1) depth[j * w + i] = d;
        }
    return depth;
}

describe('descarte do desenho pela GPU (spec 034, T060d) — referência', () => {
    it('os níveis da hierarquia: lados, posições e o total', () => {
        expect(hzbLevels()).toBe(11);
        expect(hzbLevelSize(0)).toEqual([HZB_WIDTH, HZB_HEIGHT]);
        expect(hzbLevelSize(10)).toEqual([1, 1]);
        expect(hzbLevelOffset(1)).toBe(HZB_WIDTH * HZB_HEIGHT);
        let total = 0;
        for (let k = 0; k < hzbLevels(); k++) total += hzbLevelSize(k)[0] * hzbLevelSize(k)[1];
        expect(hzbWords()).toBe(total);
    });

    it('os pixels de cada texel cobrem o eixo inteiro, sem buraco', () => {
        for (const pixels of [7, 256, 720, 1280, 3840]) {
            const covered = new Uint8Array(pixels);
            for (let t = 0; t < HZB_WIDTH; t++) {
                const [a, b] = hzbPixelRange(t, HZB_WIDTH, pixels);
                expect(b).toBeGreaterThan(a);
                // O texel só toca os pixels que a área dele em uv cruza.
                expect(a).toBeLessThanOrEqual((t * pixels) / HZB_WIDTH);
                expect(b).toBeGreaterThanOrEqual(((t + 1) * pixels) / HZB_WIDTH);
                for (let p = a; p < b; p++) covered[p] = 1;
            }
            expect(covered.every((c) => c === 1)).toBe(true);
        }
    });

    it('a hierarquia é conservadora: cada texel é o mais longe do que cobre', () => {
        const w = 300;
        const h = 170;
        const depth = Float64Array.from({ length: w * h }, (_, i) => ((i * 7919) % 1000) / 1000);
        const hw = 64;
        const hh = 32;
        const hzb = buildHzb(depth, w, h, hw, hh);
        for (let y = 0; y < hh; y++)
            for (let x = 0; x < hw; x++) {
                const [x0, x1] = hzbPixelRange(x, hw, w);
                const [y0, y1] = hzbPixelRange(y, hh, h);
                let far = 0;
                for (let j = y0; j < y1; j++)
                    for (let i = x0; i < x1; i++) far = Math.max(far, depth[j * w + i]!);
                expect(hzb[y * hw + x]).toBe(far);
            }
        for (let k = 1; k < hzbLevels(hw, hh); k++) {
            const [lw, lh] = hzbLevelSize(k, hw, hh);
            const [bw, bh] = hzbLevelSize(k - 1, hw, hh);
            for (let y = 0; y < lh; y++)
                for (let x = 0; x < lw; x++) {
                    let far = 0;
                    for (let j = 2 * y; j < Math.min(bh, 2 * y + 2); j++)
                        for (let i = 2 * x; i < Math.min(bw, 2 * x + 2); i++)
                            far = Math.max(far, hzb[hzbLevelOffset(k - 1, hw, hh) + j * bw + i]!);
                    expect(hzb[hzbLevelOffset(k, hw, hh) + y * lw + x]).toBe(far);
                }
        }
    });

    it('texel que cobre pixels demais fica longe (nunca esconde)', () => {
        const pixels = HZB_SPAN_MAX * 4 + 1;
        const hzb = buildHzb(new Float64Array(pixels).fill(0.2), pixels, 1, 2, 1);
        expect(hzb[0]).toBe(1);
    });

    it('a caixa em mundo contém os cantos transformados', () => {
        const c = Math.cos(0.7);
        const s = Math.sin(0.7);
        // Rotação em y, escala 2 em x e translação.
        const m: Mat4 = [2 * c, 0, -2 * s, 0, 0, 1, 0, 0, s, 0, c, 0, 3, -1, 4, 1];
        const lo: Vec3 = [-1, -0.5, -0.25];
        const hi: Vec3 = [1, 0.5, 0.25];
        const box = worldBox(m, lo, hi);
        let max = [0, 0, 0];
        for (let i = 0; i < 8; i++) {
            const p = mat4Apply(m, [
                i & 1 ? hi[0] : lo[0],
                i & 2 ? hi[1] : lo[1],
                i & 4 ? hi[2] : lo[2],
                1,
            ]);
            max = max.map((v, k) => Math.max(v, Math.abs(p[k]! - box.center[k]!)));
        }
        for (let k = 0; k < 3; k++) expect(box.extent[k]).toBeCloseTo(max[k]!, 12);
    });

    it('o tronco: dentro, atrás da câmera, longe e de lado', () => {
        const planes = frustumPlanes(VP);
        const one: Vec3 = [0.5, 0.5, 0.5];
        expect(outsideFrustum(planes, [0, 0, 0], one)).toBe(false);
        expect(outsideFrustum(planes, [0, 0, 10], one)).toBe(true);
        expect(outsideFrustum(planes, [0, 0, -200], one)).toBe(true);
        expect(outsideFrustum(planes, [40, 0, 0], one)).toBe(true);
        expect(outsideFrustum(planes, [0, -40, 0], one)).toBe(true);
        // Cruzando o lado: dentro.
        expect(outsideFrustum(planes, [5.6, 0, 0], [0.5, 0.5, 0.5])).toBe(false);
    });

    it('a oclusão: atrás da parede some; na frente, fora dela ou cruzando a câmera fica', () => {
        const w = 640;
        const h = 320;
        const hzb = buildHzb(wallDepth(w, h, 0, [-2, -1, 2, 1]), w, h);
        const small: Vec3 = [0.2, 0.2, 0.2];
        expect(occluded(hzb, VP, [0, 0, -2], small)).toBe(true);
        expect(occluded(hzb, VP, [0.5, 0.3, -6], small)).toBe(true);
        // Na frente da parede.
        expect(occluded(hzb, VP, [0, 0, 1], small)).toBe(false);
        // Atrás, mas saindo pela borda da parede.
        expect(occluded(hzb, VP, [2.1, 0, -2], small)).toBe(false);
        expect(occluded(hzb, VP, [0, 0, -2], [3, 0.2, 0.2])).toBe(false);
        // Um canto atrás da câmera.
        expect(occluded(hzb, VP, [0, 0, 5], [1, 1, 1])).toBe(false);
    });

    it('as listas por grupo seguem a ordem das instâncias', () => {
        const keep = [1, 0, 1, 1, 0, 0, 1, 0, 1];
        const values = [10, 11, 12, 13, 14, 15, 16, 17, 18];
        const { lists, counts } = compactGroups(keep, values, [
            { first: 0, count: 4 },
            { first: 5, count: 4 },
        ]);
        expect(lists).toEqual([
            [10, 12, 13],
            [16, 18],
        ]);
        expect(counts).toEqual([3, 2]);
    });
});
