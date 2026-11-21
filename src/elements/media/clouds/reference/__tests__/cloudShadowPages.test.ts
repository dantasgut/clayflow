import { describe, expect, it } from 'vitest';
import {
    buildVolume,
    shellSegments,
    shadowTexel,
    sphereSpan,
    type CloudModel,
    type Vec3,
} from '../cloudModel';
import {
    CLOUD_SHADOW_ATLAS,
    CLOUD_SHADOW_KEY_MANDATORY,
    CLOUD_SHADOW_MAX_AGE,
    CLOUD_SHADOW_PROBES,
    CLOUD_SHADOW_TOLERANCE,
    CLOUD_SHADOW_PAGE,
    CLOUD_SHADOW_PAGES,
    CLOUD_SHADOW_PAGES_X,
    CLOUD_SHADOW_SLOT_COUNT,
    CLOUD_SHADOW_STRIDE,
    CLOUD_SHADOW_LEVELS,
    CLOUD_SHADOW_STEP_FRAMES,
    CLOUD_SHADOW_STEP_NONE,
    shadowAspect,
    shadowAtlasTexel,
    shadowBasis,
    shadowContinuous,
    shadowLevel,
    shadowMapsBegin,
    shadowMapsEnd,
    shadowMapsOf,
    shadowStepAspect,
    shadowStepBase,
    shadowStepOf,
    shadowStepPages,
    shadowStepWeight,
    shadowPageCorners,
    shadowPageError,
    shadowPageKey,
    shadowPagePriority,
    shadowPageStats,
    shadowProbeTexel,
    shadowProbesNow,
    shadowSlot,
    shadowSlotOrigin,
    shadowSlotPage,
    shadowTexelSize,
    shadowUsable,
    shadowWindow,
    type ShadowFrame,
    type ShadowMaps,
} from '../cloudShadowPages';

const rad = Math.PI / 180;
const sunOf = (elevation: number, azimuth: number): Vec3 => [
    Math.cos(elevation * rad) * Math.cos(azimuth * rad),
    Math.sin(elevation * rad),
    Math.cos(elevation * rad) * Math.sin(azimuth * rad),
];
const frameOf = (sun: Vec3, camera: [number, number] = [0, 0], texel = 50): ShadowFrame => {
    const b = shadowBasis(sun);
    const band = 0;
    return { pivot: [0, 0, 0], right: b.right, up: b.up, sun, texel, band, camera };
};

/** Cúmulos em células (a cobertura em senos cruzados), volumes constantes: bordas de ~100–300 m na densidade. */
function cellModel(): CloudModel {
    const one = buildVolume(() => [1, 1, 1, 1], 2);
    const zero = buildVolume(() => [0, 0, 0, 0], 2);
    return {
        groundRadius: 6_360_200,
        base: 1500,
        top: 4000,
        coverage: (x, z) => [
            Math.min(
                1,
                Math.max(
                    0,
                    0.45
                        + 0.6
                            * Math.sin((2 * Math.PI * x) / 2300)
                            * Math.sin((2 * Math.PI * z) / 3100),
                ),
            ),
            0.5,
            1,
        ],
        density: 0.03,
        albedo: 0.99,
        shape: one,
        detail: zero,
        shapeScale: 12000,
        detailScale: 1800,
        shapeOffset: [0, 0, 0],
        detailOffset: [0, 0, 0],
        windDir: [1, 0],
    };
}

/** As colunas de uma página (espelho de `cloud_shadow_main`): τ dos 16 nós, o comprimento do trecho e a distância das pontas ao plano. */
function renderPage(
    m: CloudModel,
    f: ShadowFrame,
    k: number,
    g: readonly [number, number],
): { taus: number[][]; lengths: number[]; levers: number[] } {
    const ta = shadowTexelSize(f.texel, k);
    const t = ta * shadowAspect(f.band, f.sun);
    const S = CLOUD_SHADOW_STRIDE;
    const taus: number[][] = [];
    const lengths: number[] = [];
    const levers: number[] = [];
    const down: Vec3 = [-f.sun[0], -f.sun[1], -f.sun[2]];
    for (let j = 0; j < S; j++)
        for (let i = 0; i < S; i++) {
            const x = (g[0] * CLOUD_SHADOW_PAGE + i + 0.5) * t;
            const y = (g[1] * CLOUD_SHADOW_PAGE + j + 0.5) * ta;
            const o0: Vec3 = [
                f.pivot[0] + f.right[0] * x + f.up[0] * y,
                f.pivot[1] + f.right[1] * x + f.up[1] * y,
                f.pivot[2] + f.right[2] * x + f.up[2] * y,
            ];
            const span = sphereSpan(m, o0, f.sun, m.groundRadius + m.top);
            const entry = span === undefined ? 0 : Math.max(span[1], 0) + 1;
            const o: Vec3 = [
                o0[0] + f.sun[0] * entry,
                o0[1] + f.sun[1] * entry,
                o0[2] + f.sun[2] * entry,
            ];
            const segs = shellSegments(m, o, down, Infinity);
            taus.push([...shadowTexel(m, o, down, 96)]);
            if (segs.length === 0) {
                lengths.push(0);
                levers.push(0);
            } else {
                const [a, b] = segs[0]!;
                lengths.push(b - a);
                levers.push(Math.max(Math.abs(entry - a), Math.abs(entry - b)));
            }
        }
    return { taus, lengths, levers };
}

/** O comprimento do trecho da casca na coluna do centro da página. */
function centerLength(
    m: CloudModel,
    f: ShadowFrame,
    k: number,
    g: readonly [number, number],
): number {
    const t = shadowTexelSize(f.texel, k);
    const x = (g[0] + 0.5) * CLOUD_SHADOW_PAGE * t * shadowAspect(f.band, f.sun);
    const y = (g[1] + 0.5) * CLOUD_SHADOW_PAGE * t;
    const o0: Vec3 = [
        f.right[0] * x + f.up[0] * y,
        f.right[1] * x + f.up[1] * y,
        f.right[2] * x + f.up[2] * y,
    ];
    const span = sphereSpan(m, o0, f.sun, m.groundRadius + m.top);
    const entry = span === undefined ? 0 : Math.max(span[1], 0) + 1;
    const o: Vec3 = [o0[0] + f.sun[0] * entry, o0[1] + f.sun[1] * entry, o0[2] + f.sun[2] * entry];
    const segs = shellSegments(m, o, [-f.sun[0], -f.sun[1], -f.sun[2]], Infinity);
    return segs.length === 0 ? 0 : segs[0]![1] - segs[0]![0];
}

describe('mapa visto do sol por páginas: endereçamento', () => {
    it('o referencial é ortonormal e contínuo do zênite ao sol abaixo do horizonte', () => {
        // Arrange
        let worstJump = 0;
        let prev = shadowBasis(sunOf(90, 30));
        // Act: o sol do zênite a −10° em passos de 0,05° (sem a troca de eixo de cross(y, sol) perto de 82°).
        for (let e = 89.95; e >= -10; e -= 0.05) {
            const s = sunOf(e, 30);
            const b = shadowBasis(s);
            const d = (a: Vec3, c: Vec3): number => a[0] * c[0] + a[1] * c[1] + a[2] * c[2];
            // Assert: ortonormal.
            expect(Math.abs(d(b.right, b.right) - 1)).toBeLessThan(1e-12);
            expect(Math.abs(d(b.up, b.up) - 1)).toBeLessThan(1e-12);
            expect(Math.abs(d(b.right, s))).toBeLessThan(1e-12);
            expect(Math.abs(d(b.up, s))).toBeLessThan(1e-12);
            expect(Math.abs(d(b.right, b.up))).toBeLessThan(1e-12);
            worstJump = Math.max(
                worstJump,
                Math.hypot(
                    b.right[0] - prev.right[0],
                    b.right[1] - prev.right[1],
                    b.right[2] - prev.right[2],
                ),
            );
            prev = b;
        }
        // O passo de 0,05° (8,7·10⁻⁴ rad) gira a direita de no máximo ~2 vezes isso.
        expect(worstJump).toBeLessThan(2 * 0.05 * rad);
    });

    it('cada página da janela de cada mapa tem uma página física só, os mapas de degraus vizinhos não se sobrepõem, e a janela que anda guarda as que ficam', () => {
        const states: ShadowMaps[] = [
            { leaving: 0, entering: 0, weight: 1 },
            { leaving: 1, entering: 1, weight: 1 },
            { leaving: 2, entering: 2, weight: 1 },
            { leaving: 0, entering: 1, weight: 0.3 },
            { leaving: 1, entering: 2, weight: 0 },
            { leaving: 2, entering: 1, weight: 0.7 },
        ];
        for (const maps of states)
            for (const el of [30, 12, 4]) {
                // Arrange
                const f = { ...frameOf(sunOf(el, 10), [1234, -5678]), maps };
                const g = { ...frameOf(sunOf(el, 10), [1234 + 1700, -5678 - 900]), maps };
                const steps = [...new Set([maps.leaving, maps.entering])];
                // Act
                const slots = new Set<number>();
                let active = 0;
                for (let s = 0; s < CLOUD_SHADOW_SLOT_COUNT; s++) {
                    const a = shadowSlotPage(f, s);
                    if (!a.active) continue;
                    active++;
                    // Assert: o endereço toroidal da página que a janela do degrau põe no slot é o próprio slot.
                    expect(steps).toContain(a.step);
                    expect(shadowSlot(a.level, a.page, a.step)).toBe(s);
                    slots.add(s);
                    // A página está na janela do degrau.
                    const w = shadowWindow(f, a.level, a.step);
                    expect(a.page[0] - w[0]).toBeGreaterThanOrEqual(0);
                    expect(a.page[0] - w[0]).toBeLessThan(shadowStepPages(a.step));
                    expect(a.page[1] - w[1]).toBeGreaterThanOrEqual(0);
                    expect(a.page[1] - w[1]).toBeLessThan(CLOUD_SHADOW_PAGES);
                    // Na janela que andou, a página que segue nela fica no mesmo slot (não é redesenhada).
                    const b = shadowSlotPage(g, s);
                    const wb = shadowWindow(g, a.level, a.step);
                    const stays =
                        a.page[0] >= wb[0]
                        && a.page[0] < wb[0] + shadowStepPages(a.step)
                        && a.page[1] >= wb[1]
                        && a.page[1] < wb[1] + CLOUD_SHADOW_PAGES;
                    if (stays) expect(b.page).toEqual(a.page);
                }
                // Os mapas do quadro inteiros e disjuntos: cada degrau com as suas páginas da janela em todos os níveis.
                const want = steps.reduce(
                    (n, m) => n + CLOUD_SHADOW_LEVELS * CLOUD_SHADOW_PAGES * shadowStepPages(m),
                    0,
                );
                expect(active).toBe(want);
                expect(slots.size).toBe(want);
            }
        // As janelas: 8, 14 e 32 páginas à direita; os degraus vizinhos lado a lado nas físicas.
        expect([0, 1, 2].map(shadowStepPages)).toEqual([8, 14, 32]);
        expect(shadowStepBase(1) + shadowStepPages(1)).toBeLessThanOrEqual(CLOUD_SHADOW_PAGES_X);
        expect(shadowStepBase(2) + shadowStepPages(2)).toBeLessThanOrEqual(shadowStepBase(1));
        expect(shadowStepBase(0) + shadowStepPages(0)).toBeLessThanOrEqual(shadowStepBase(1));
        // O registro de estado logo depois das páginas, num lugar do atlas que nenhuma página usa.
        expect(CLOUD_SHADOW_SLOT_COUNT + 1).toBeLessThanOrEqual(
            (CLOUD_SHADOW_ATLAS / CLOUD_SHADOW_STRIDE) ** 2,
        );
    });

    it('a razão do texel à direita em degraus pela elevação, nunca acima da contínua tan(el)/tan(19°)', () => {
        // Arrange
        const t19 = Math.tan(19 * rad);
        let steps = 0;
        let prev = shadowAspect(0, sunOf(-2, 0));
        // Act: o sol do horizonte ao zênite em centésimos de grau.
        for (let el = -2; el <= 90; el += 0.01) {
            const sun = sunOf(el, 37);
            const r = shadowAspect(0, sun);
            // Assert: um dos degraus, nunca mais grosso que a contínua, e o raio útil em metros nos dois eixos coberto
            // pelas páginas da janela à direita.
            expect([1, 0.5, 0.2]).toContain(r);
            if (el > 0)
                expect(r).toBeLessThanOrEqual(Math.max(Math.tan(el * rad) / t19, 0.2) + 1e-12);
            expect(r).toBeGreaterThanOrEqual(prev);
            const useful = (CLOUD_SHADOW_PAGES / 2 - 1) * CLOUD_SHADOW_PAGE - 2;
            const nx = shadowStepPages(shadowStepOf(shadowContinuous(sun)));
            expect(shadowStepAspect(shadowStepOf(shadowContinuous(sun)))).toBe(r);
            expect((nx / 2 - 1) * CLOUD_SHADOW_PAGE).toBeGreaterThanOrEqual(useful / r + 2);
            expect(nx).toBeLessThanOrEqual(CLOUD_SHADOW_PAGES_X);
            if (r !== prev) steps++;
            prev = r;
        }
        // Dois degraus no caminho (0,2 → ½ a ~9,8°, ½ → 1 a 19°); o sol rasante do `sunset` (4°) com 0,2, o meio-dia quadrado.
        expect(steps).toBe(2);
        expect(shadowAspect(0, sunOf(4, 0))).toBe(0.2);
        expect(shadowAspect(0, sunOf(9.7, 0))).toBe(0.2);
        expect(shadowAspect(0, sunOf(9.9, 0))).toBe(0.5);
        expect(shadowAspect(0, sunOf(18.9, 0))).toBe(0.5);
        expect(shadowAspect(0, sunOf(19.1, 0))).toBe(1);
        expect(shadowAspect(0, sunOf(60, 0))).toBe(1);
    });

    it('a troca de degrau: o mapa novo desenhado dentro do orçamento, a mistura em N quadros, a folga, a inversão', () => {
        // Arrange: o sol do `solposto` descendo pelo degrau de ~9,8° (0,035°/quadro) e voltando.
        const elOf = (c: number) => (Math.atan(c * Math.tan(19 * rad)) * 180) / Math.PI;
        const down = elOf(0.5);
        // As páginas do mapa novo desenhadas pelo orçamento: 2048 do degrau de 0,2 a 128 por quadro.
        const pagesOf = (m: number) =>
            CLOUD_SHADOW_LEVELS * CLOUD_SHADOW_PAGES * shadowStepPages(m);
        const budget = 128;
        let maps: ShadowMaps | undefined;
        let drawn = 0;
        const log: { el: number; maps: ShadowMaps }[] = [];
        // Act
        for (let fr = 0; fr < 400; fr++) {
            const el = down + 2 - 0.035 * fr;
            const sun = sunOf(el, 30);
            const begun = shadowMapsBegin(maps, sun);
            if (begun.leaving !== begun.entering && begun.weight === 0 && maps?.weight !== 0)
                drawn = 0;
            if (begun.leaving !== begun.entering)
                drawn = Math.min(drawn + budget, pagesOf(begun.entering));
            maps = shadowMapsEnd(begun, pagesOf(begun.entering) - drawn);
            log.push({ el, maps });
        }
        // Assert: parado em ½ acima do degrau, a troca para 0,2 começa logo abaixo dele (nunca acima da contínua), o
        // mapa novo fica pronto em 16 quadros com peso 0 e o peso sobe 1/N por quadro até 1.
        const start = log.findIndex((r) => r.maps.entering === 2);
        expect(log[start - 1]!.maps).toEqual({ leaving: 1, entering: 1, weight: 1 });
        expect(log[start]!.el).toBeLessThan(down);
        expect(log[start - 1]!.el).toBeGreaterThanOrEqual(down);
        const weights = log.slice(start).map((r) => r.maps.weight);
        const ramp = weights.findIndex((w) => w > 0);
        expect(ramp).toBe(Math.ceil(pagesOf(2) / budget) - 1);
        for (let i = 1; i < weights.length; i++) {
            expect(weights[i]! - weights[i - 1]!).toBeLessThanOrEqual(
                1 / CLOUD_SHADOW_STEP_FRAMES + 1e-12,
            );
            expect(weights[i]!).toBeGreaterThanOrEqual(weights[i - 1]!);
        }
        const done = weights.findIndex((w) => w >= 1);
        expect(done - ramp).toBe(CLOUD_SHADOW_STEP_FRAMES - 1);
        expect(log.at(-1)!.maps).toEqual({ leaving: 2, entering: 2, weight: 1 });
        // A folga: o sol que sobe logo acima do limiar não volta a ½; com a contínua 5 % acima, volta.
        const s2: ShadowMaps = { leaving: 2, entering: 2, weight: 1 };
        expect(shadowMapsBegin(s2, sunOf(elOf(0.51), 0))).toEqual(s2);
        expect(shadowMapsBegin(s2, sunOf(elOf(0.53), 0))).toEqual({
            leaving: 2,
            entering: 1,
            weight: 0,
        });
        // A inversão: no meio da troca, o sol que volta ao de onde troca os papéis com o peso complementar.
        const mid: ShadowMaps = { leaving: 1, entering: 2, weight: 0.25 };
        expect(shadowMapsBegin(mid, sunOf(elOf(0.6), 0))).toEqual({
            leaving: 2,
            entering: 1,
            weight: 0.75,
        });
        expect(shadowMapsBegin(mid, sunOf(elOf(0.45), 0))).toEqual(mid);
        // O sol que salta dois degraus num quadro troca de uma vez (as páginas físicas de 1 e 0,2 se sobrepõem).
        const s0: ShadowMaps = { leaving: 0, entering: 0, weight: 1 };
        expect(shadowMapsBegin(s0, sunOf(4, 0))).toEqual(s2);
        // Sem estado (a época da série), o degrau do sol.
        expect(shadowMapsBegin(undefined, sunOf(4, 0))).toEqual(shadowMapsOf(sunOf(4, 0)));
        expect(shadowMapsOf(sunOf(60, 0))).toEqual(s0);
        // Os pesos da leitura: os dois mapas somam 1; fora da troca, só o para onde.
        for (const m of [mid, s2])
            expect([0, 1, 2].reduce((n, k) => n + shadowStepWeight(m, k), 0)).toBeCloseTo(1, 12);
        expect(shadowStepWeight(s2, 1)).toBe(0);
        expect(CLOUD_SHADOW_STEP_NONE).toBe(3);
    });

    it('na troca de degrau o que se lê muda por quadro 1/N da diferença dos dois mapas (f64, cúmulos em células)', () => {
        // Arrange: o sol no degrau de ~9,8°, pontos do chão perto da câmera (nível 0); a transmitância lida do mapa
        // de ½ e do de 0,2 (a bilinear dos texels das colunas f64 de cada um) e a mistura pelo estado quadro a quadro. A
        // nuvem rala em células de ~200 m de bordas vivas (as colunas de ~15 km pela casca com o sol a 9,8° com τ de
        // ordem 1; a borda menor que o texel à direita de ½ é o que a razão fina resolve).
        const m: CloudModel = {
            ...cellModel(),
            density: 0.0004,
            coverage: (x, z) => [
                Math.min(
                    1,
                    Math.max(
                        0,
                        0.5
                            + 3
                                * Math.sin((2 * Math.PI * x) / 410)
                                * Math.sin((2 * Math.PI * z) / 530),
                    ),
                ),
                0.5,
                1,
            ],
        };
        const el = (Math.atan(0.5 * Math.tan(19 * rad)) * 180) / Math.PI;
        const sun = sunOf(el - 0.01, 30);
        const f = frameOf(sun);
        const down: Vec3 = [-sun[0], -sun[1], -sun[2]];
        const cache = new Map<string, number>();
        /** T ao fim da coluna do texel global (i, j) do nível 0 com a razão `a` à direita. */
        const texelT = (i: number, j: number, a: number): number => {
            const key = `${a}:${i}:${j}`;
            const hit = cache.get(key);
            if (hit !== undefined) return hit;
            const x = (i + 0.5) * f.texel * a;
            const y = (j + 0.5) * f.texel;
            const o0: Vec3 = [
                f.right[0] * x + f.up[0] * y,
                f.right[1] * x + f.up[1] * y,
                f.right[2] * x + f.up[2] * y,
            ];
            const span = sphereSpan(m, o0, sun, m.groundRadius + m.top);
            const entry = span === undefined ? 0 : Math.max(span[1], 0) + 1;
            const o: Vec3 = [
                o0[0] + sun[0] * entry,
                o0[1] + sun[1] * entry,
                o0[2] + sun[2] * entry,
            ];
            const t = Math.exp(-shadowTexel(m, o, down, 96)[15]!);
            cache.set(key, t);
            return t;
        };
        /** A transmitância lida no ponto `x` do plano com a razão `a` (a bilinear das transmitâncias). */
        const read = (x: readonly [number, number], a: number): number => {
            const X = x[0] / (f.texel * a) - 0.5;
            const Y = x[1] / f.texel - 0.5;
            const i = Math.floor(X);
            const j = Math.floor(Y);
            const u = X - i;
            const v = Y - j;
            return (
                (texelT(i, j, a) * (1 - u) + texelT(i + 1, j, a) * u) * (1 - v)
                + (texelT(i, j + 1, a) * (1 - u) + texelT(i + 1, j + 1, a) * u) * v
            );
        };
        const points: [number, number][] = Array.from({ length: 120 }, (_, n) => [
            (((n * 0.618034) % 1) - 0.5) * 4000,
            (((n * 0.754878) % 1) - 0.5) * 4000,
        ]);
        const half = points.map((x) => read(x, shadowStepAspect(1)));
        const fine = points.map((x) => read(x, shadowStepAspect(2)));
        let gap = 0;
        points.forEach((_, n) => (gap = Math.max(gap, Math.abs(fine[n]! - half[n]!))));
        // Act: a troca de ½ para 0,2 (o mapa novo pronto), quadro a quadro.
        let maps: ShadowMaps = { leaving: 1, entering: 1, weight: 1 };
        let prev = half;
        let jump = 0;
        for (let fr = 0; fr < 2 * CLOUD_SHADOW_STEP_FRAMES; fr++) {
            maps = shadowMapsEnd(shadowMapsBegin(maps, sun), 0);
            const now = points.map(
                (_, n) =>
                    half[n]! * shadowStepWeight(maps, 1) + fine[n]! * shadowStepWeight(maps, 2),
            );
            now.forEach((t, n) => (jump = Math.max(jump, Math.abs(t - prev[n]!))));
            prev = now;
        }
        console.log(
            `troca de degrau (f64): a diferença entre os mapas de ½ e 0,2 até ${(gap * 255).toFixed(1)} níveis de T; o maior salto por quadro na mistura ${(jump * 255).toFixed(2)} níveis`,
        );
        // Assert: o mapa novo inteiro no fim, e o salto por quadro 1/N da diferença (a troca de uma vez saltava ela toda).
        expect(maps).toEqual({ leaving: 2, entering: 2, weight: 1 });
        prev.forEach((t, n) => expect(t).toBeCloseTo(fine[n]!, 12));
        expect(gap).toBeGreaterThan(CLOUD_SHADOW_TOLERANCE);
        expect(jump).toBeLessThanOrEqual(gap / CLOUD_SHADOW_STEP_FRAMES + 1e-12);
    }, 60_000);

    it.each([20, 4])(
        'o par do filtro fica na página física, e o nível cobre o ponto com a borda até o último (sol a %s°)',
        (el) => {
            // Arrange
            const f = frameOf(sunOf(el, 50), [321, 77]);
            let maxLevelUsed = 0;
            // Act
            for (let i = 0; i < 4000; i++) {
                const r = 50 * 1.0035 ** i;
                const a = i * 2.39996;
                const x: [number, number] = [
                    f.camera[0] + r * Math.cos(a),
                    f.camera[1] + r * Math.sin(a),
                ];
                const [k, blend] = shadowLevel(f, x);
                maxLevelUsed = Math.max(maxLevelUsed, k);
                for (const level of blend > 0 ? [k, k + 1] : [k]) {
                    const p = shadowAtlasTexel(f, x, level);
                    // Assert: os dois texels do filtro (floor(p − ½) e +1) na mesma página física.
                    const lx =
                        p[0] - 0.5 - Math.floor(p[0] / CLOUD_SHADOW_STRIDE) * CLOUD_SHADOW_STRIDE;
                    const ly =
                        p[1] - 0.5 - Math.floor(p[1] / CLOUD_SHADOW_STRIDE) * CLOUD_SHADOW_STRIDE;
                    expect(lx).toBeGreaterThanOrEqual(0);
                    expect(lx).toBeLessThanOrEqual(CLOUD_SHADOW_PAGE);
                    expect(ly).toBeGreaterThanOrEqual(0);
                    expect(ly).toBeLessThanOrEqual(CLOUD_SHADOW_PAGE);
                    // Dentro do raio útil, o ponto não é preso à borda da janela.
                    const d = Math.max(Math.abs(x[0] - f.camera[0]), Math.abs(x[1] - f.camera[1]));
                    if (d <= shadowUsable(f.texel, level)) {
                        const t = shadowTexelSize(f.texel, level) * shadowAspect(0, f.sun);
                        const w = shadowWindow(f, level);
                        const X = x[0] / t;
                        expect(X).toBeGreaterThanOrEqual(w[0] * CLOUD_SHADOW_PAGE + 0.5);
                        expect(X).toBeLessThanOrEqual(
                            (w[0] + shadowStepPages(shadowStepOf(shadowContinuous(f.sun))))
                                * CLOUD_SHADOW_PAGE
                                - 0.5,
                        );
                    }
                }
            }
            // O último nível alcança ±192 km com o texel de 50 m (o horizonte do sol baixo).
            expect(maxLevelUsed).toBe(CLOUD_SHADOW_LEVELS - 1);
            expect(shadowUsable(50, CLOUD_SHADOW_LEVELS - 1)).toBeGreaterThan(190_000);
            expect(shadowSlotOrigin(CLOUD_SHADOW_SLOT_COUNT - 1)[1]).toBeLessThan(
                CLOUD_SHADOW_ATLAS,
            );
        },
    );
});

describe('mapa visto do sol por páginas: as filas da escolha', () => {
    it('a maior prioridade fica abaixo da fila das obrigatórias e as filas crescem com ela', () => {
        // Arrange
        const top = shadowPagePriority(5, 0, true, CLOUD_SHADOW_MAX_AGE);
        const priorities = Array.from({ length: 200 }, (_, i) => 2 ** (i * 0.11));
        // Act
        const keys = priorities.map(shadowPageKey);
        // Assert
        expect(shadowPageKey(top)).toBeLessThan(CLOUD_SHADOW_KEY_MANDATORY - 1);
        keys.slice(1).forEach((k, i) => expect(k).toBeGreaterThanOrEqual(keys[i]!));
        expect(shadowPageKey(2 ** 7)).toBe(15);
    });

    /**
     * O sol que anda: todas as páginas com a mudança plena a cada quadro, `budget` por quadro, as filas e a ordem da página
     * física como na GPU. Devolve a maior idade de uma página na escolha.
     */
    function starvation(key: (p: number) => number, pages: number, budget: number): number {
        const age = new Array<number>(pages).fill(0);
        let worst = 0;
        for (let frame = 0; frame < 600; frame++) {
            for (let i = 0; i < pages; i++) age[i]!++;
            const order = age
                .map((a, i) => ({ i, k: key(shadowPagePriority(1, 3, true, a)) }))
                .sort((a, b) => b.k - a.k || a.i - b.i);
            for (const { i } of order.slice(0, budget)) age[i] = 0;
            worst = Math.max(worst, ...age);
        }
        return worst;
    }

    it('com o sol andando, nenhuma página espera muito mais que páginas ÷ orçamento quadros', () => {
        // Arrange: 2048 páginas (8 níveis × 8 × 32 com o sol rasante), 128 por quadro; as 14 filas de uma oitava de antes.
        const octaves = (p: number): number =>
            Math.min(Math.max(1 + Math.floor(Math.log2(p)), 1), 14);
        // Act
        const now = starvation(shadowPageKey, 2048, 128);
        const before = starvation(octaves, 2048, 128);
        // Assert: na meia oitava as idades de 1,41× se separam; com a fila de cima saturada, a ordem física decidia.
        expect(now).toBeLessThanOrEqual(2 * (2048 / 128));
        expect(before).toBeGreaterThan(CLOUD_SHADOW_MAX_AGE / 2);
    });
});

describe('mapa visto do sol por páginas: o esquema de invalidação no tempo (f64)', () => {
    /**
     * O esquema quadro a quadro (espelho de `cloud_shadow_probe_main` e `cloud_shadow_select_main`): por página, a
     * previsão pela geometria e a medida nas colunas de prova (guardada até a página ser refeita); as que passam da
     * tolerância, por prioridade (`shadowPagePriority`), até `budget` por quadro. Devolve o erro de verdade do que os
     * consumidores leem em cada página e quadro (o guardado contra o refeito, em T, em todos os texels e nós) e quantas
     * vezes as páginas foram refeitas.
     */
    // As provas medem no quadro em que a página não foi refeita; a escolha do quadro seguinte as lê.
    function simulate(
        m: CloudModel,
        pages: readonly { k: number; g: [number, number] }[],
        sunAt: (frame: number) => Vec3,
        frames: number,
        budget: number,
    ): { errors: number[]; steps: number[]; renders: number } {
        const S = CLOUD_SHADOW_STRIDE;
        const recordOf = (
            f: ShadowFrame,
            r: ReturnType<typeof renderPage>,
            k: number,
            g: [number, number],
        ) => ({
            sun: f.sun,
            time: 0,
            ...shadowPageStats(r.taus, r.lengths, r.levers, shadowTexelSize(f.texel, k)),
            centerLength: centerLength(m, f, k, g),
        });
        const f0 = frameOf(sunAt(0));
        const state = pages.map((p) => {
            const stored = renderPage(m, f0, p.k, p.g);
            return {
                ...p,
                slot: shadowSlot(p.k, p.g, shadowStepOf(shadowContinuous(f0.sun))),
                stored,
                last: stored,
                rec: recordOf(f0, stored, p.k, p.g),
                measured: 0,
                age: 0,
            };
        });
        const steps: number[] = [];
        let renders = 0;
        const errors: number[] = [];
        const all = Array.from({ length: 16 }, (_, n) => n);
        const diff = (
            a: readonly number[],
            b: readonly number[],
            knots: readonly number[] = all,
        ): number => {
            let e = 0;
            for (const n of knots) e = Math.max(e, Math.abs(Math.exp(-a[n]!) - Math.exp(-b[n]!)));
            return e;
        };
        for (let frame = 1; frame <= frames; frame++) {
            const f = frameOf(sunAt(frame));
            const fresh = state.map((p) => renderPage(m, f, p.k, p.g));
            const wanted: { i: number; priority: number }[] = [];
            state.forEach((p, i) => {
                const predicted = shadowPageError(
                    p.rec,
                    {
                        sun: f.sun,
                        time: 0,
                        centerLength: centerLength(m, f, p.k, p.g),
                        residualWind: 0,
                        evolution: 0,
                    },
                    shadowPageCorners(f.texel, p.k, p.g, shadowAspect(f.band, f.sun)),
                );
                const e = Math.max(predicted, p.measured);
                p.age++;
                if (e > CLOUD_SHADOW_TOLERANCE)
                    wanted.push({ i, priority: shadowPagePriority(e, p.k, true, p.age) });
            });
            // As filas da GPU (meias oitavas, `shadowPageKey`) e, dentro de uma, a ordem da página física.
            wanted.sort(
                (a, b) =>
                    shadowPageKey(b.priority) - shadowPageKey(a.priority)
                    || state[a.i]!.slot - state[b.i]!.slot,
            );
            const chosen = new Set(wanted.slice(0, budget).map((w) => w.i));
            state.forEach((p, i) => {
                if (chosen.has(i)) {
                    p.stored = fresh[i]!;
                    p.rec = recordOf(f, p.stored, p.k, p.g);
                    p.measured = 0;
                    p.age = 0;
                    renders++;
                    return;
                }
                // As provas das páginas não refeitas (em rodízio): os nós 4, 8, 12 e 16 de colunas embaralhadas, lidos na
                // escolha seguinte.
                if (!shadowProbesNow(p.slot, frame)) return;
                for (let j = 0; j < CLOUD_SHADOW_PROBES; j++) {
                    const t = shadowProbeTexel(p.slot, frame, j);
                    p.measured = Math.max(
                        p.measured,
                        diff(p.stored.taus[t]!, fresh[i]!.taus[t]!, [3, 7, 11, 15]),
                    );
                }
            });
            state.forEach((p, i) => {
                let e = 0;
                let step = 0;
                for (let t = 0; t < S * S; t++) {
                    e = Math.max(e, diff(p.stored.taus[t]!, fresh[i]!.taus[t]!));
                    step = Math.max(step, diff(p.last.taus[t]!, fresh[i]!.taus[t]!));
                }
                errors.push(e);
                steps.push(step);
                p.last = fresh[i]!;
            });
        }
        return { errors, steps, renders };
    }

    const levels = (v: number): string => (v * 255).toFixed(2);
    const summary = (errors: readonly number[]): { p50: number; p99: number; max: number } => {
        const sorted = [...errors].sort((a, b) => a - b);
        return {
            p50: sorted[Math.floor(sorted.length / 2)]!,
            p99: sorted[Math.floor(sorted.length * 0.99)]!,
            max: sorted[sorted.length - 1]!,
        };
    };
    const pages: { k: number; g: [number, number] }[] = [
        { k: 0, g: [-1, 0] },
        { k: 0, g: [0, -1] },
        { k: 2, g: [1, -2] },
        { k: 2, g: [-2, 0] },
        { k: 4, g: [-2, 1] },
        { k: 4, g: [1, 1] },
    ];

    it('com o sol parado nenhuma página é refeita e o que se lê é o refeito', () => {
        // Arrange
        const m = cellModel();
        // Act
        const r = simulate(m, pages, () => sunOf(15, 30), 20, pages.length);
        // Assert
        expect(r.renders).toBe(0);
        expect(Math.max(...r.errors)).toBe(0);
    }, 60_000);

    it('com o sol andando e orçamento para todas, o que se lê fica na tolerância; com orçamento de ⅓, perto dela', () => {
        // Arrange
        const m = cellModel();
        const runs = [
            { name: 'lento (0,005°/quadro a 15°)', rate: 0.005, e: 15 },
            { name: 'vídeo (0,05°/quadro a 8°)', rate: 0.05, e: 8 },
            { name: 'pôr do sol (0,05°/quadro a 6°)', rate: 0.05, e: 6 },
        ];
        // Act
        const out = runs.flatMap((run) =>
            [pages.length, pages.length / 3].map((budget) => {
                const r = simulate(m, pages, (fr) => sunOf(run.e - run.rate * fr, 30), 30, budget);
                const s = summary(r.errors);
                const d = summary(r.steps);
                console.log(
                    `esquema ${run.name}, orçamento ${budget} de ${pages.length}: refeitas ${r.renders} de ${30 * pages.length}; erro do que se lê (níveis de 8 bits de T) p50 ${levels(s.p50)}, p99 ${levels(s.p99)}, máx ${levels(s.max)}; o mapa refeito muda por quadro p50 ${levels(d.p50)}, p99 ${levels(d.p99)}, máx ${levels(d.max)}`,
                );
                return { budget, ...s, step: d };
            }),
        );
        // Assert: com orçamento para todas, nada passa da tolerância (1 nível).
        for (const r of out.filter((x) => x.budget === pages.length))
            expect(r.max).toBeLessThanOrEqual(CLOUD_SHADOW_TOLERANCE);
        // Com ⅓ por quadro (cada página refeita a cada ~3 quadros), o erro fica no que o mapa refeito muda em ~3 quadros.
        for (const r of out.filter((x) => x.budget < pages.length))
            expect(r.p50).toBeLessThanOrEqual(3 * r.step.p50 + CLOUD_SHADOW_TOLERANCE);
    }, 120_000);
});
