import { describe, expect, it } from 'vitest';
import {
    buildVolume,
    buildVolumeLevels,
    cloudDensity,
    coverageField,
    defaultShape,
    sampleVolume,
    sampleVolumeLevel,
    volumeLod,
    type CloudModel,
    type Vec3,
} from '../cloudModel';
import {
    CLOUD_SUN_VOLUME_CELL,
    CLOUD_SUN_VOLUME_INVALID,
    CLOUD_SUN_VOLUME_PAGE,
    CLOUD_SUN_VOLUME_PAGES,
    CLOUD_SUN_VOLUME_PROBES,
    CLOUD_SUN_VOLUME_RATE,
    CLOUD_SUN_VOLUME_RATE_FLOOR,
    CLOUD_SUN_VOLUME_STRIDE,
    CLOUD_SUN_VOLUME_TOLERANCE,
    sunCone,
    sunConeBase,
    sunConeExtent,
    sunConeWithVolume,
    CLOUD_SUN_VOLUME_LEVELS,
    CLOUD_SUN_VOLUME_REST_ARM,
    sunVolumeCameraAt,
    sunVolumeChange,
    sunVolumeCoords,
    sunVolumeGlobalAt,
    sunVolumeInWindow,
    sunVolumeKey,
    sunVolumeLength,
    sunVolumeBlend,
    sunVolumeLevel,
    sunVolumeRestAllowed,
    sunVolumeLookup,
    sunVolumeNode,
    sunVolumePhysical,
    sunVolumeProbeNodes,
    sunVolumeQueued,
    sunVolumeRate,
    sunVolumeSpacing,
    sunVolumeValid,
    sunVolumeValue,
    type SunVolumeGrid,
} from '../cloudSunVolume';

const rad = Math.PI / 180;
const sunOf = (elevation: number): Vec3 => {
    const e = elevation * rad;
    const s: Vec3 = [Math.cos(e), Math.sin(e), 0.3 * Math.cos(e)];
    const l = Math.hypot(...s);
    return [s[0] / l, s[1] / l, s[2] / l];
};

/**
 * A camada padrão (1500–4000 m, cobertura e tipo 0,5, extinção 0,04/m) com a forma padrão em volumes de 32³: o detalhe no
 * período de 1800 m (o de produção) e a forma no de 3000 m — o texel de 94 m da forma de 128³ em 12 km, com as bolhas
 * 4 × mais finas que as de produção (o caso mais difícil para a interpolação).
 */
const shape = buildVolume(defaultShape, 32);
const model: CloudModel = {
    groundRadius: 6_360_200,
    base: 1500,
    top: 4000,
    coverage: (x, z) => [coverageField(x, z, 0.5, 0.5), 0.5, 1],
    density: 0.04,
    albedo: 0.99,
    shape,
    detail: shape,
    shapeScale: 3000,
    detailScale: 1800,
    shapeOffset: [0, 0, 0],
    detailOffset: [0, 0, 0],
    windDir: [1, 0],
};
const thickness = model.top - model.base;
const base = sunConeBase(thickness);
const length = sunVolumeLength(base, 6);

let seed = 99;
const rnd = (): number => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
/** Pontos com nuvem a ±3 km da origem (dentro da janela do nível 0). */
const cloudPoints = (n: number): Vec3[] => {
    const out: Vec3[] = [];
    while (out.length < n) {
        const x: Vec3 = [(rnd() - 0.5) * 6000, 1500 + rnd() * 2500, (rnd() - 0.5) * 6000];
        if (cloudDensity(model, x) > 0) out.push(x);
    }
    return out;
};
/** A integral exata do cone (passos de 1 m) de `x` para o sol. */
const exactCone = (x: Vec3, sun: Vec3): number => {
    const D = sunConeExtent(base, 6);
    const n = Math.ceil(D);
    let tau = 0;
    for (let i = 0; i < n; i++) {
        const t = ((i + 0.5) * D) / n;
        tau +=
            cloudDensity(model, [x[0] + sun[0] * t, x[1] + sun[1] * t, x[2] + sun[2] * t])
            * (D / n);
    }
    return tau * model.density;
};
/** O erro relativo médio (nos pontos com τ > 0,05). */
const meanRelative = (est: readonly number[], exact: readonly number[]): number => {
    let e = 0;
    let n = 0;
    est.forEach((v, k) => {
        if (exact[k]! <= 0.05) return;
        e += Math.abs(v - exact[k]!) / exact[k]!;
        n++;
    });
    return e / n;
};

describe('cloudSunVolume — o volume de τ até o sol perto da câmera (T074)', () => {
    it('o τ do cone pelo volume (células de 50 m, 39 m na altura) erra menos que o cone de 6 amostras; a 120 m, mais (f64)', () => {
        // Arrange
        const spacing = sunVolumeSpacing(thickness)!;
        const grid = (cell: number): SunVolumeGrid => ({ offset: [137, -61], cell, spacing });
        const camera: [number, number] = [0, 0];
        const report: string[] = [];
        for (const elevation of [4, 30]) {
            const sun = sunOf(elevation);
            const points = cloudPoints(90);
            const exact = points.map((x) => exactCone(x, sun));
            const cone = points.map((x) => sunCone(model, x, sun, base, 6));
            const viaVolume = (cell: number): number[] => {
                const g = grid(cell);
                const nodes = new Map<string, number>();
                const node = (n: Vec3): number => {
                    const k = n.join(',');
                    let v = nodes.get(k);
                    if (v === undefined) {
                        v = sunVolumeValue(model, sunVolumeNode(model, g, n), sun, length);
                        nodes.set(k, v);
                    }
                    return v;
                };
                const window: [number, number] = [
                    camera[0] + Math.round(-g.offset[0] / (g.cell * CLOUD_SUN_VOLUME_PAGE)),
                    camera[1] + Math.round(-g.offset[1] / (g.cell * CLOUD_SUN_VOLUME_PAGE)),
                ];
                return points.map(
                    (x) =>
                        sunConeWithVolume(model, x, sun, base, (q) =>
                            sunVolumeLookup(sunVolumeCoords(model, g, q), window, node),
                        ) ?? Number.NaN,
                );
            };
            // Act
            const fine = viaVolume(CLOUD_SUN_VOLUME_CELL);
            const coarse = viaVolume(120);
            const eCone = meanRelative(cone, exact);
            const eFine = meanRelative(fine, exact);
            const eCoarse = meanRelative(coarse, exact);
            report.push(
                `sol ${elevation}°: cone ${(eCone * 100).toFixed(2)} %, volume a ${CLOUD_SUN_VOLUME_CELL} m ${(eFine * 100).toFixed(2)} %, a 120 m ${(eCoarse * 100).toFixed(2)} %`,
            );
            // Assert: o volume não erra mais que o cone que ele substitui; a 120 m, sim (o lado da célula).
            expect(fine.every(Number.isFinite)).toBe(true);
            expect(eFine).toBeLessThan(eCone);
            expect(eCoarse).toBeGreaterThan(eFine);
        }
        console.log(`o volume de τ até o sol (erro médio de τ do cone): ${report.join('; ')}`);
    });

    it('a leitura devolve o nó no nó, é contínua na borda da página e não vale fora da janela nem da casca', () => {
        // Arrange
        const value = (g: Vec3): number => g[0] * 1.5 + g[1] * 0.25 - g[2] * 0.75;
        const P = CLOUD_SUN_VOLUME_PAGE;
        const camera: [number, number] = [3, -2];
        // Act / Assert: no nó, o valor dele; dos dois lados da borda (x = 8), o mesmo (os nós de borda são os mesmos).
        expect(sunVolumeLookup([2 * P + 3, 5, -P + 1], camera, value)).toBeCloseTo(
            value([2 * P + 3, 5, -P + 1]),
            12,
        );
        const left = sunVolumeLookup([P - 1e-9, 4.5, 2.5], camera, value)!;
        const right = sunVolumeLookup([P + 1e-9, 4.5, 2.5], camera, value)!;
        expect(Math.abs(left - right)).toBeLessThan(1e-6);
        // Linear: a trilinear o reproduz no meio da célula.
        expect(sunVolumeLookup([3.5, 2.5, 1.5], camera, value)).toBeCloseTo(
            value([3.5, 2.5, 1.5]),
            12,
        );
        const half = Math.floor(CLOUD_SUN_VOLUME_PAGES[0] / 2);
        expect(sunVolumeLookup([(camera[0] + half) * P + 1, 4, 1], camera, value)).toBeUndefined();
        expect(
            sunVolumeLookup([(camera[0] - half) * P + 1, 4, -2 * P], camera, value),
        ).toBeDefined();
        expect(sunVolumeLookup([1, -0.1, 1], camera, value)).toBeUndefined();
        expect(
            sunVolumeLookup([1, CLOUD_SUN_VOLUME_PAGES[1] * P + 0.1, 1], camera, value),
        ).toBeUndefined();
    });

    it('o endereço toroidal: cada lugar físico guarda uma página da janela e cada página da janela tem o seu lugar', () => {
        for (const camera of [0, 7, -13, 1001]) {
            const n = CLOUD_SUN_VOLUME_PAGES[0];
            const seen = new Set<number>();
            for (let p = 0; p < n; p++) {
                const g = sunVolumeGlobalAt(p, camera, n);
                expect(sunVolumeInWindow(g, camera, n)).toBe(true);
                expect(sunVolumePhysical(g, n)).toBe(p);
                seen.add(g);
            }
            expect(seen.size).toBe(n);
            expect(sunVolumeInWindow(camera, camera, n)).toBe(true);
        }
    });

    it('a mudança pela taxa medida: linear no deslocamento, as duas partes, a página sai da leitura no teto do nível', () => {
        // Arrange
        const r = {
            sun: sunOf(6),
            time: 10,
            rate: CLOUD_SUN_VOLUME_RATE,
            restRate: CLOUD_SUN_VOLUME_RATE,
            tau: 2,
            restTau: 4,
        };
        const now = (elevation: number, time = 10, evolution = 0) => ({
            sun: sunOf(elevation),
            time,
            driftRate: 1,
            length,
            evolution,
        });
        // Act
        const quarter = sunVolumeChange(r, now(6.25));
        const half = sunVolumeChange(r, now(6.5));
        const drift = sunVolumeChange(r, now(6, 15));
        const evolving = sunVolumeChange(r, now(6, 15, 600));
        // Assert: linear no ângulo; o resto pelo braço (o deslocamento × braço/L no ângulo); a deriva igual nas duas.
        expect(half[0] / quarter[0]).toBeCloseTo(2, 2);
        expect(quarter[1] / quarter[0]).toBeCloseTo(CLOUD_SUN_VOLUME_REST_ARM / length, 2);
        expect(drift[0]).toBeCloseTo(CLOUD_SUN_VOLUME_RATE * 5, 9);
        expect(drift[1]).toBeCloseTo(CLOUD_SUN_VOLUME_RATE * 5, 9);
        expect(evolving[0] - drift[0]).toBeCloseTo((2 * 5) / 600, 9);
        expect(evolving[1] - drift[1]).toBeCloseTo((4 * 5) / 600, 9);
        expect(sunVolumeRate(0.02, 10, 0.5)).toBeCloseTo(0.002, 12);
        expect(sunVolumeRate(0, 10, 0.5)).toBe(CLOUD_SUN_VOLUME_RATE_FLOOR);
        expect(sunVolumeRate(0.02, 0.5, 0.0042)).toBe(0.0042);
        expect(sunVolumeValid(true, CLOUD_SUN_VOLUME_INVALID * 0.99)).toBe(true);
        expect(sunVolumeValid(true, CLOUD_SUN_VOLUME_INVALID)).toBe(false);
        expect(sunVolumeValid(true, CLOUD_SUN_VOLUME_INVALID, 2)).toBe(true);
        expect(sunVolumeValid(false, 0)).toBe(false);
        // O resto que muda depressa (o sol andando) não entra na fila; parado, entra.
        const fast: [number, number] = [0, CLOUD_SUN_VOLUME_INVALID];
        expect(sunVolumeQueued(fast, 1 / 60, 0)).toBe(0);
        expect(sunVolumeQueued(fast, 60, 0)).toBe(CLOUD_SUN_VOLUME_INVALID);
        // A fila: sem desenho, a de cima (os níveis finos e as perto antes); abaixo da tolerância do nível, nada.
        expect(sunVolumeKey(false, 0, 0, 0)).toBe(31);
        expect(sunVolumeKey(false, 0, 1, 0)).toBe(29);
        expect(sunVolumeKey(false, 0, 0, 40)).toBe(24);
        expect(sunVolumeKey(true, CLOUD_SUN_VOLUME_TOLERANCE * 0.9, 0, 0)).toBe(0);
        expect(sunVolumeKey(true, CLOUD_SUN_VOLUME_TOLERANCE * 1.5, 1, 0)).toBe(0);
        expect(sunVolumeKey(true, CLOUD_SUN_VOLUME_TOLERANCE * 4, 0, 0)).toBeGreaterThan(
            sunVolumeKey(true, CLOUD_SUN_VOLUME_TOLERANCE * 1.5, 0, 0),
        );
        expect(sunVolumeKey(true, 1e6, 0, 0)).toBeLessThan(24);
        const probes = sunVolumeProbeNodes();
        expect(probes.length).toBe(CLOUD_SUN_VOLUME_PROBES);
        expect(Math.max(...probes)).toBeLessThan(CLOUD_SUN_VOLUME_STRIDE ** 3);
    });

    it('os níveis: o mais fino cuja janela contém o ponto, o resto pela pegada, o anel de fora mistura; a câmera de cada nível', () => {
        // A janela do nível k (±10 páginas de 8 células de 50·2^k m) contém o ponto a 10 km no nível 2 (±16 km), não no 1.
        const P = CLOUD_SUN_VOLUME_PAGE;
        const half = CLOUD_SUN_VOLUME_PAGES[0] / 2;
        const inWindow = (r: number) => (k: number) =>
            r < half * P * CLOUD_SUN_VOLUME_CELL * 2 ** k;
        expect(sunVolumeLevel(inWindow(1000))).toBe(0);
        expect(sunVolumeLevel(inWindow(10_000))).toBe(2);
        expect(sunVolumeLevel(inWindow(1e6))).toBeUndefined();
        // O resto: no nível 0 sempre; num nível de 200 m, só com a pegada do pixel de 200 m ou mais.
        expect(sunVolumeRestAllowed(CLOUD_SUN_VOLUME_CELL, CLOUD_SUN_VOLUME_CELL, 0)).toBe(true);
        expect(sunVolumeRestAllowed(200, CLOUD_SUN_VOLUME_CELL, 150)).toBe(false);
        expect(sunVolumeRestAllowed(200, CLOUD_SUN_VOLUME_CELL, 200)).toBe(true);
        // O anel: peso 1 dentro, 0 na borda, linear na última página.
        expect(sunVolumeBlend([5, 7])).toBe(1);
        expect(sunVolumeBlend([0.25, 7])).toBeCloseTo(0.25, 12);
        expect(sunVolumeBlend([7, CLOUD_SUN_VOLUME_PAGES[2] - 0.5])).toBeCloseTo(0.5, 12);
        // A câmera do nível k: a do nível 0 por baixo (a mesma do ponto da câmera no nível).
        for (const c of [-17, -1, 0, 5, 33])
            for (let k = 0; k < CLOUD_SUN_VOLUME_LEVELS; k++)
                expect(sunVolumeCameraAt(c, k)).toBe(Math.floor(c / 2 ** k));
    });

    it('a taxa de partida é a medida na f64: |Δτ| médio por metro com o sol virando 0,5° e com a deriva do detalhe', () => {
        // Arrange
        const points = cloudPoints(80);
        const drifted: CloudModel = { ...model, detailOffset: [0, 4, 0] };
        // Act
        let dSun = 0;
        let dDrift = 0;
        for (const x of points) {
            const a = sunVolumeValue(model, x, sunOf(4), length);
            dSun += Math.abs(sunVolumeValue(model, x, sunOf(4.5), length) - a);
            dDrift += Math.abs(sunVolumeValue(drifted, x, sunOf(4), length) - a);
        }
        const rateSun = dSun / points.length / (length * 0.5 * rad);
        const rateDrift = dDrift / points.length / 4;
        console.log(
            `a taxa da mudança do volume de τ: sol ${rateSun.toFixed(4)}/m, deriva ${rateDrift.toFixed(4)}/m (de partida ${CLOUD_SUN_VOLUME_RATE})`,
        );
        // Assert: a de partida na mesma ordem das duas (a forma aqui tem bolhas 4 × mais finas: a medida sobe).
        for (const r of [rateSun, rateDrift]) {
            expect(r).toBeGreaterThan(CLOUD_SUN_VOLUME_RATE / 3);
            expect(r).toBeLessThan(CLOUD_SUN_VOLUME_RATE * 6);
        }
    });

    it('os níveis de detalhe da forma: a média exata do volume periódico, e a leitura pela largura não deixa a luz com menos amostras (f64)', () => {
        // Arrange: a pirâmide do volume (a média se conserva em cada nível; o nível 1 no texel é a média dos 8).
        const levels = buildVolumeLevels(shape, 4, false);
        const mean = (d: Float32Array): number =>
            d.reduce((a, v, k) => (k % 4 === 0 ? a + v : a), 0) / (d.length / 4);
        for (const l of levels) expect(mean(l.data)).toBeCloseTo(mean(shape.data), 5);
        const u: Vec3 = [3 / 32, 5 / 32, 9 / 32];
        expect(sampleVolumeLevel(levels, u, 0)[0]).toBeCloseTo(sampleVolume(shape, u)[0], 12);
        expect(volumeLod(3000 / 32, 3000, 32)).toBeCloseTo(0, 12);
        expect(volumeLod(4 * (3000 / 32), 3000, 32)).toBeCloseTo(2, 12);
        // Act: o cone de 6 amostras no nível 0 contra 4 amostras do mesmo comprimento, no nível 0 e pela largura.
        const lodded: CloudModel = { ...model, shapeLevels: levels, detailLevels: levels };
        const sun = sunOf(30);
        const points = cloudPoints(60);
        const exact = points.map((x) => exactCone(x, sun));
        const D = sunConeExtent(base, 6);
        let r = 2;
        for (let k = 0; k < 60; k++) {
            const s = (0.5 * base * (r ** 4 - 1)) / (r - 1);
            r *= (D / s) ** 0.05;
        }
        const lens = Array.from({ length: 4 }, (_, i) => 0.5 * base * r ** i);
        const four = (m: CloudModel, widths: boolean): number[] =>
            points.map((x) => {
                let t = 0;
                let tau = 0;
                for (const len of lens) {
                    const s = t + 0.5 * len;
                    tau +=
                        cloudDensity(
                            m,
                            [x[0] + sun[0] * s, x[1] + sun[1] * s, x[2] + sun[2] * s],
                            0,
                            true,
                            widths ? 0.5 * len : 0,
                        ) * len;
                    t += len;
                }
                return tau * m.density;
            });
        const eSix = meanRelative(
            points.map((x) => sunCone(model, x, sun, base, 6)),
            exact,
        );
        const eFour = meanRelative(four(model, false), exact);
        const eFourLod = meanRelative(four(lodded, true), exact);
        console.log(
            `os níveis na luz: cone de 6 ${(eSix * 100).toFixed(2)} %, 4 amostras ${(eFour * 100).toFixed(2)} %, 4 pela largura ${(eFourLod * 100).toFixed(2)} %`,
        );
        // Assert: o nível pela largura não leva as 4 amostras ao cone de 6 (a pirâmide é a média num cubo, e
        // a luz pede a integral na linha) — a luz não lê os níveis; o volume de τ é a peça que corta as amostras.
        expect(eFourLod).toBeGreaterThan(eSix);
    });
});
