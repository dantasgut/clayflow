import { describe, expect, it } from 'vitest';
import {
    deepWaterSingleScatter,
    fresnelFromAir,
    refractDown,
    type DeepWater,
} from '../mediumScatter';

/** A água pura (Pope e Fry 1997 a 650/550/450 nm; Smith e Baker 1981) a 50 m. */
const PURE: DeepWater = {
    ior: 1.333,
    absorption: [0.34, 0.0565, 0.0092],
    scattering: [0.000927, 0.001908, 0.004541],
    g: 0,
    depth: 50,
};

/** A mesma integral por marcha (pontos médios) pelos ângulos de Snell, sem a forma fechada. */
function marched(
    water: DeepWater,
    thetaView: number,
    thetaLight: number,
    phiDelta: number,
    e: number,
): number[] {
    const n = water.ior;
    const tv = Math.asin(Math.sin(thetaView) / n);
    const ts = Math.asin(Math.sin(thetaLight) / n);
    // O cosseno entre a luz que anda (descendo a ts, o azimute horizontal oposto a `phiDelta`) e a direção para quem vê
    // (subindo a tv).
    const cosTheta = Math.sin(ts) * Math.sin(tv) * Math.cos(phiDelta) - Math.cos(ts) * Math.cos(tv);
    const g = water.g;
    const phase = (1 - g * g) / (4 * Math.PI * Math.pow(1 + g * g - 2 * g * cosTheta, 1.5));
    const steps = 200_000;
    const length = water.depth / Math.cos(tv);
    const ds = length / steps;
    return [0, 1, 2].map((k) => {
        const sigmaS = water.scattering[k]!;
        const sigmaT = water.absorption[k]! + sigmaS;
        let sum = 0;
        for (let i = 0; i < steps; i++) {
            const s = (i + 0.5) * ds;
            const z = s * Math.cos(tv);
            sum += Math.exp(-sigmaT * s) * Math.exp(-sigmaT * (z / Math.cos(ts))) * ds;
        }
        const enter =
            (1 - fresnelFromAir(Math.cos(thetaLight), n)) * (Math.cos(thetaLight) / Math.cos(ts));
        const leave = (1 - fresnelFromAir(Math.cos(thetaView), n)) / (n * n);
        return enter * leave * e * sigmaS * phase * sum;
    });
}

describe('espalhamento simples na água funda (spec 034, T067e)', () => {
    it('a forma fechada contra a marcha pelos ângulos, com a luz e a visão em azimutes diferentes', () => {
        for (const [tvDeg, tsDeg, phi, g] of [
            [0, 0, 0, 0],
            [40, 0, 0, 0],
            [40, 30, Math.PI, 0.3],
            [60, 45, 0.7, -0.2],
        ] as const) {
            const tv = (tvDeg * Math.PI) / 180;
            const ts = (tsDeg * Math.PI) / 180;
            const view: [number, number, number] = [Math.sin(tv), -Math.cos(tv), 0];
            const light: [number, number, number] = [
                -Math.sin(ts) * Math.cos(phi),
                -Math.cos(ts),
                -Math.sin(ts) * Math.sin(phi),
            ];
            const water = { ...PURE, g };
            const got = deepWaterSingleScatter(water, view, light, [3, 3, 3]);
            const want = marched(water, tv, ts, phi, 3);
            for (let k = 0; k < 3; k++) expect(got[k]! / want[k]! - 1).toBeLessThan(1e-6);
            for (let k = 0; k < 3; k++) expect(got[k]! / want[k]! - 1).toBeGreaterThan(-1e-6);
        }
    });

    it('a água pura funda é azul: o azul espalha ~100× o vermelho; sem espalhamento, nada', () => {
        const view: [number, number, number] = [Math.sin(0.7), -Math.cos(0.7), 0];
        const sun: [number, number, number] = [0, -1, 0];
        const l = deepWaterSingleScatter(PURE, view, sun, [1, 1, 1]);
        expect(l[2] / l[0]).toBeGreaterThan(50);
        expect(l[1] / l[0]).toBeGreaterThan(5);
        const clear = deepWaterSingleScatter(
            { ...PURE, scattering: [0, 0, 0] },
            view,
            sun,
            [1, 1, 1],
        );
        expect(clear).toEqual([0, 0, 0]);
        // Profundidade zero, nada; a refração da direção conserva a unidade.
        expect(deepWaterSingleScatter({ ...PURE, depth: 0 }, view, sun, [1, 1, 1])).toEqual([
            0, 0, 0,
        ]);
        const r = refractDown(view, 1.333);
        expect(Math.hypot(r[0], r[1], r[2])).toBeCloseTo(1, 12);
    });
});
