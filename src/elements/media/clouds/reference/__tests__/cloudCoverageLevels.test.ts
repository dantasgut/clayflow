import { describe, expect, it } from 'vitest';
import {
    CLOUD_COVERAGE_PAGE,
    CLOUD_COVERAGE_PAGES,
    CLOUD_COVERAGE_SIDE,
    cloudCoverageLevels,
    coverageCenter,
    coverageDrawVolume,
    COVERAGE_BAND,
    COVERAGE_REACH,
    coverageLevel,
    coverageReach,
    coverageRingTexel,
    coverageSample,
    coverageSampleLevel,
    coverageSlot,
    coverageSlotPage,
    coverageTexelCenter,
    coverageTexelSize,
    coverageUsable,
    coverageUv,
    coverageVolumeReader,
    coverageWindow,
    volumeBilinearRepeat,
    type CoverageLevels,
} from '../cloudCoverageLevels';

// O mapa de cobertura em níveis (spec 041, R21 rodada 19, T077): o endereçamento do atlas, a leitura por níveis e o que
// ela resolve perto da câmera.

/** O perfil alto: texel de 31,25 m no nível 0, o lado de 256 km no último. */
const HIGH = { coverage: { texel: 31.25, budget: 128 }, coverageExtent: 256_000 } as const;

/** Um campo liso de teste (m): ondas de 1,5 e 2,3 km. */
const smooth = (x: number, z: number): number =>
    0.5 + 0.25 * Math.sin(x / 1500 + 0.3) + 0.25 * Math.cos(z / 2300 - 1.1);

/** O texel global de um campo: o valor no centro dele. */
const texelOf =
    (m: CoverageLevels, f: (x: number, z: number) => number) =>
    (k: number, i: number, j: number): number[] => {
        const [x, z] = coverageTexelCenter(m, k, i, j);
        return [f(x, z)];
    };

/** Gerador pseudoaleatório reprodutível (LCG). */
function rng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 2 ** 32;
    };
}

describe('mapa de cobertura em níveis (T077)', () => {
    it('o perfil alto tem 6 níveis de 31,25 a 1000 m e o último cobre ±239 km (o lado de 256 km inteiro)', () => {
        const levels = cloudCoverageLevels(HIGH);
        expect(levels).toBe(6);
        const m: CoverageLevels = { texel: 31.25, levels, eye: [0, 0] };
        expect(coverageTexelSize(m, 4)).toBe(500);
        expect(coverageUsable(m, 0)).toBeCloseTo(7468.75, 6);
        expect(coverageUsable(m, 5)).toBeCloseTo(239_000, 6);
        expect(coverageUsable(m, 4)).toBeLessThan(128_000);
        expect(CLOUD_COVERAGE_SIDE).toBe(512);
    });

    it('cada página da janela tem uma página física só, e a página física devolve a global', () => {
        const m: CoverageLevels = { texel: 31.25, levels: 3, eye: [-12_345.6, 98_765.4] };
        for (let k = 0; k < m.levels; k++) {
            const w = coverageWindow(m, k);
            const seen = new Set<number>();
            for (let a = 0; a < CLOUD_COVERAGE_PAGES; a++)
                for (let b = 0; b < CLOUD_COVERAGE_PAGES; b++) {
                    const g: [number, number] = [w[0] + a, w[1] + b];
                    const slot = coverageSlot(k, g);
                    expect(seen.has(slot)).toBe(false);
                    seen.add(slot);
                    expect(coverageSlotPage(m, slot)).toEqual({ k, g });
                }
        }
    });

    it('a leitura no volume (o endereço que se repete) é a bilinear dos texels globais da janela', () => {
        // 3 níveis de 100 m com a câmera fora da origem: o volume desenhado página a página e o filtro do hardware.
        const m: CoverageLevels = { texel: 100, levels: 3, eye: [3217.4, -8841.9] };
        const value = coverageRingTexel(m, texelOf(m, smooth));
        const data = coverageDrawVolume(m, 1, value);
        const read = coverageVolumeReader(data, 1);
        const rand = rng(7);
        let worst = 0;
        let worstRead = 0;
        for (let n = 0; n < 4000; n++) {
            const k = n % m.levels;
            const u = coverageUsable(m, k);
            const w: [number, number] = [
                m.eye[0] + (2 * rand() - 1) * u,
                m.eye[1] + (2 * rand() - 1) * u,
            ];
            const [a, b] = coverageUv(m, w, k);
            const hw = volumeBilinearRepeat(data, 1, k, a, b)[0]!;
            worst = Math.max(worst, Math.abs(hw - coverageSampleLevel(m, w, k, value)[0]!));
            worstRead = Math.max(worstRead, Math.abs(hw - coverageSampleLevel(m, w, k, read)[0]!));
        }
        expect(worst).toBeLessThan(1e-12);
        expect(worstRead).toBeLessThan(1e-12);
    });

    it('a leitura por níveis segue o campo liso sem degrau na passagem de um nível ao outro', () => {
        const m: CoverageLevels = { texel: 31.25, levels: 5, eye: [51_234.5, -7_310.2] };
        const value = coverageRingTexel(m, texelOf(m, smooth));
        const outside = (w: readonly [number, number]): number[] => [smooth(w[0], w[1])];
        // O erro da bilinear: ≤ t²/8 × (|f_xx| + |f_zz|) do nível mais grosso usado no ponto (no anel, o seguinte).
        const curvature = 0.25 / 1500 ** 2 + 0.25 / 2300 ** 2;
        let worst = 0;
        let step = 0;
        let prev: number | undefined;
        // Uma linha da câmera até fora do mapa, de 5 em 5 m (passa por todas as faixas de mistura).
        for (let d = 0; d < 125_000; d += 5) {
            const w: [number, number] = [m.eye[0] + d, m.eye[1] + 0.37 * d];
            const v = coverageSample(m, w, value, outside)[0]!;
            const k = coverageLevel(m, w);
            const ring =
                k < m.levels && coverageReach(m, w, k) > COVERAGE_REACH - COVERAGE_BAND - 1;
            const t = coverageTexelSize(m, Math.min(k + (ring ? 1 : 0), m.levels - 1));
            worst = Math.max(
                worst,
                Math.abs(v - smooth(w[0], w[1])) / ((t * t * curvature) / 8 + 1e-9),
            );
            // Dentro do mapa (fora dele vale o campo no ponto, como antes do mapa em níveis: a costura da borda do último
            // nível é a da bilinear de 500 m contra o campo, ~0,005 aqui).
            if (prev !== undefined && k < m.levels) step = Math.max(step, Math.abs(v - prev));
            prev = v;
        }
        // Dentro do limite da bilinear em todo ponto; nenhum salto maior que o do campo em 5 m (|∇f| ≤ 2,8 × 10⁻⁴/m).
        expect(worst).toBeLessThanOrEqual(1.0001);
        expect(step).toBeLessThan(5 * 2.8e-4);
    });

    it('um vão de 80 m a 200 m da câmera é resolvido pelo nível 0 (o mapa único de 250 m não o via)', () => {
        const m: CoverageLevels = { texel: 31.25, levels: 5, eye: [0, 0] };
        const center = [180, 90] as const;
        const hole = (x: number, z: number): number =>
            Math.hypot(x - center[0], z - center[1]) < 40 ? 0 : 1;
        const outside = (w: readonly [number, number]): number[] => [hole(w[0], w[1])];
        const level = (w: readonly [number, number]): number =>
            coverageSample(m, w, coverageRingTexel(m, texelOf(m, hole)), outside)[0]!;
        // O mapa único antigo: 1024 texels de 250 m em 256 km, centrado na câmera encaixada.
        const old = (x: number, z: number): number => {
            const T = 250;
            const fx = x / T + 512 - 0.5;
            const fz = z / T + 512 - 0.5;
            const i = Math.floor(fx);
            const j = Math.floor(fz);
            const v = (a: number, b: number): number =>
                hole((a - 512 + 0.5) * T, (b - 512 + 0.5) * T);
            const ax = fx - i;
            const az = fz - j;
            return (
                (v(i, j) * (1 - ax) + v(i + 1, j) * ax) * (1 - az)
                + (v(i, j + 1) * (1 - ax) + v(i + 1, j + 1) * ax) * az
            );
        };
        expect(level(center)).toBeLessThan(0.15);
        expect(old(center[0], center[1])).toBeGreaterThan(0.9);
        // A borda de 10–90 % ao longo de x pelo meio do vão: no máximo 1,3 texel do nível 0 (a bilinear de um degrau).
        const xs: number[] = [];
        for (let x = center[0]; x < center[0] + 150; x += 0.25) xs.push(x);
        const v = xs.map((x) => level([x, center[1]]));
        const lo = xs[v.findIndex((c) => c >= 0.1)]!;
        const hi = xs[v.findIndex((c) => c >= 0.9)]!;
        expect(hi - lo).toBeLessThanOrEqual(1.3 * m.texel);
        // O meio da borda no raio do vão (± meio texel).
        const half = xs[v.findIndex((c) => c >= 0.5)]! - center[0];
        expect(Math.abs(half - 40)).toBeLessThanOrEqual(0.5 * m.texel + 0.25);
    });

    it('o nível escolhido sempre cobre o ponto, e na borda dele o anel vale o que o seguinte lê ali', () => {
        const m: CoverageLevels = { texel: 31.25, levels: 5, eye: [1234.5, -987.6] };
        const value = coverageRingTexel(m, texelOf(m, smooth));
        const rand = rng(3);
        let worst = 0;
        for (let n = 0; n < 4000; n++) {
            const r = 125_000 * rand() ** 2;
            const a = 2 * Math.PI * rand();
            const w: [number, number] = [m.eye[0] + r * Math.cos(a), m.eye[1] + r * Math.sin(a)];
            const k = coverageLevel(m, w);
            if (k >= m.levels) continue;
            expect(coverageReach(m, w, k)).toBeLessThanOrEqual(COVERAGE_REACH);
            if (k > 0) expect(coverageReach(m, w, k - 1)).toBeGreaterThan(COVERAGE_REACH);
        }
        // Pontos na borda da janela do nível 0 (alcance 255): o nível 0 contra o nível 1 no mesmo ponto.
        const c = coverageCenter(m, 0);
        const t = coverageTexelSize(m, 0);
        for (let n = 0; n < 200; n++) {
            const s2 = -COVERAGE_REACH + (2 * COVERAGE_REACH * n) / 199;
            const w: [number, number] = [(c[0] + COVERAGE_REACH) * t, (c[1] + s2) * t];
            const a0 = coverageSampleLevel(m, w, 0, value)[0]!;
            const a1 = coverageSampleLevel(m, w, 1, value)[0]!;
            worst = Math.max(worst, Math.abs(a0 - a1));
        }
        // O que sobra é o peso do anel no texel de dentro (0,996) e a curvatura do campo entre os texels: < 10⁻⁴.
        expect(worst).toBeLessThan(1e-4);
    });

    it('fora do último nível vale o campo no ponto', () => {
        const m: CoverageLevels = { texel: 31.25, levels: 5, eye: [0, 0] };
        const w: [number, number] = [130_000, 0];
        expect(coverageLevel(m, w)).toBe(5);
        expect(coverageSample(m, w, texelOf(m, smooth), () => [0.123])[0]).toBe(0.123);
        expect(CLOUD_COVERAGE_PAGE * CLOUD_COVERAGE_PAGES).toBe(512);
    });
});
