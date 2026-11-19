import { describe, expect, it } from 'vitest';
import {
    diskFraction,
    exactSurfaceVisibility,
    marchSurfaceVisibility,
    sampledHeight,
    sampleSurfaceField,
    SURFACE_SHADOW_STEPS,
    type HeightFunction,
} from '../colliders/reference/surfaceShadow';

// A sombra pelo campo de alturas (spec 041, rodada 13): o espelho f64 da marcha da GPU na pirâmide de máximos contra a
// marcha fina no mesmo campo amostrado e contra o horizonte exato do campo analítico.

/** Colinas gaussianas (25–55 m, raios de 120–250 m) com ondulações de 13–37 m (±4,5 m). */
const hills: HeightFunction = (x, z) => {
    let s = 0;
    for (const [cx, cz, a, r] of [
        [-400, -300, 40, 180],
        [300, -100, 55, 250],
        [-100, 500, 30, 140],
        [500, -600, 25, 120],
        [-600, 300, 35, 200],
    ] as const)
        s += a * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (2 * r * r));
    return s + 3 * Math.sin(x / 37) * Math.cos(z / 29) + 1.5 * Math.sin((x + 2 * z) / 13);
};
const BOX = [-1000, 1000, -1000, 1000] as const;
const SUN_R = 0.004675;

function sunDir(elevationDeg: number, azimuth: number): [number, number, number] {
    const e = (elevationDeg * Math.PI) / 180;
    return [Math.cos(e) * Math.cos(azimuth), Math.sin(e), Math.cos(e) * Math.sin(azimuth)];
}

function points(n: number): [number, number][] {
    const out: [number, number][] = [];
    for (let k = 0; k < n; k++)
        out.push([((k * 0.618034) % 1) * 1600 - 800, ((k * 0.754878) % 1) * 1600 - 800]);
    return out;
}

describe('sombra pelo campo de alturas (referência f64)', () => {
    it('a fração do disco acima do horizonte é a área do segmento circular', () => {
        for (const x of [-1, -0.6, -0.2, 0, 0.3, 0.7, 1]) {
            // Integração numérica: a área do disco unitário acima da reta y = x.
            let area = 0;
            const N = 20000;
            for (let i = 0; i < N; i++) {
                const y = -1 + (2 * (i + 0.5)) / N;
                if (y > x) area += (2 * Math.sqrt(1 - y * y) * 2) / N;
            }
            expect(diskFraction(x * 0.01, 0, 0.01)).toBeCloseTo(area / Math.PI, 3);
        }
        expect(diskFraction(0.5, 0.1, 0)).toBe(0);
        expect(diskFraction(-0.5, 0.1, 0)).toBe(1);
    });

    it('a marcha na pirâmide é a marcha fina no mesmo campo, no orçamento de passos', () => {
        const f = sampleSurfaceField(hills, BOX, 513, 513);
        const cell = 2000 / 512;
        const sampled: HeightFunction = (x, z) =>
            sampledHeight(f, (x - BOX[0]) / cell, (z - BOX[2]) / cell);
        let sum = 0;
        let count = 0;
        let exhausted = 0;
        for (const el of [1, 3, 8, 25]) {
            for (const [k, [x, z]] of points(200).entries()) {
                const l = sunDir(el, k * 2.399);
                const p: [number, number, number] = [x, sampled(x, z), z];
                const m = marchSurfaceVisibility(f, p, l, SUN_R);
                const ref = exactSurfaceVisibility(sampled, BOX, p, l, SUN_R, cell / 32);
                sum += Math.abs(m.visibility - ref);
                count++;
                if (m.steps >= SURFACE_SHADOW_STEPS) exhausted++;
            }
        }
        // O orçamento acaba só nos raios rasantes mais longos (≤ 0,5 %); a média fica na marcha fina.
        expect(exhausted / count).toBeLessThanOrEqual(0.005);
        expect(sum / count).toBeLessThan(0.005);
    });

    it('o campo de 2 m contra o horizonte exato: o erro médio da visibilidade ≤ 1,5 %', () => {
        const f = sampleSurfaceField(hills, BOX, 1025, 1025);
        for (const el of [2, 5, 15]) {
            let sum = 0;
            const pts = points(300);
            for (const [k, [x, z]] of pts.entries()) {
                const l = sunDir(el, k * 2.399);
                const p: [number, number, number] = [x, hills(x, z), z];
                const m = marchSurfaceVisibility(f, p, l, SUN_R);
                const ref = exactSurfaceVisibility(hills, BOX, p, l, SUN_R, 0.5);
                sum += Math.abs(m.visibility - ref);
            }
            // A diferença é a do campo amostrado (a marcha fina nele dá o mesmo): ondulações de 13 m em nós de 2 m.
            expect(sum / pts.length).toBeLessThan(0.015);
        }
    });

    it('o ponto abaixo do campo fica na sombra; o acima de tudo, na luz', () => {
        const f = sampleSurfaceField(hills, BOX, 257, 257);
        const l = sunDir(30, 0.7);
        expect(
            marchSurfaceVisibility(f, [300, hills(300, -100) - 20, -100], l, SUN_R).visibility,
        ).toBe(0);
        expect(marchSurfaceVisibility(f, [300, 500, -100], l, SUN_R).visibility).toBe(1);
        // Luz a pino: nada tapa.
        expect(marchSurfaceVisibility(f, [0, hills(0, 0), 0], [0, 1, 0], SUN_R).visibility).toBe(1);
    });
});
