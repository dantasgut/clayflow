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
    CLOUD_SHADOW_PROBES,
    CLOUD_SHADOW_TOLERANCE,
    CLOUD_SHADOW_PAGE,
    CLOUD_SHADOW_PAGES,
    CLOUD_SHADOW_PAGES_X,
    CLOUD_SHADOW_SLOT_COUNT,
    CLOUD_SHADOW_STRIDE,
    CLOUD_SHADOW_LEVELS,
    shadowAspect,
    shadowAspectCurrent,
    shadowAtlasTexel,
    shadowBasis,
    shadowLevel,
    shadowPagesX,
    shadowPageCorners,
    shadowPageError,
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

    it('cada página da janela tem uma página física só, e a janela que anda guarda as que ficam', () => {
        for (const [el, ratio, pagesX] of [
            [30, 1, 8],
            [12, 0.5, 14],
            [6, 0.2, CLOUD_SHADOW_PAGES_X],
            [4, 0.2, CLOUD_SHADOW_PAGES_X],
            [-0.5, 0.2, CLOUD_SHADOW_PAGES_X],
        ] as const) {
            // Arrange
            const f = frameOf(sunOf(el, 10), [1234, -5678]);
            const g = frameOf(sunOf(el, 10), [1234 + 1700, -5678 - 900]);
            const nx = shadowPagesX(shadowAspect(0, f.sun));
            // Act
            const slots = new Set<number>();
            let active = 0;
            for (let s = 0; s < CLOUD_SHADOW_SLOT_COUNT; s++) {
                const a = shadowSlotPage(f, s);
                slots.add(shadowSlot(a.level, a.page));
                // Assert: o endereço toroidal da página que a janela põe no slot é o próprio slot.
                expect(shadowSlot(a.level, a.page)).toBe(s);
                // A página está nas páginas físicas do nível; as ativas, na janela.
                const w = shadowWindow(f, a.level);
                expect(a.page[0] - w[0]).toBeGreaterThanOrEqual(0);
                expect(a.page[0] - w[0]).toBeLessThan(CLOUD_SHADOW_PAGES_X);
                expect(a.page[1] - w[1]).toBeLessThan(CLOUD_SHADOW_PAGES);
                expect(a.active).toBe(a.page[0] - w[0] < nx);
                if (a.active) active++;
                // Na janela que andou, a página que segue nela fica no mesmo slot (não é redesenhada).
                const b = shadowSlotPage(g, s);
                const wb = shadowWindow(g, a.level);
                const stays =
                    a.active
                    && a.page[0] >= wb[0]
                    && a.page[0] < wb[0] + nx
                    && a.page[1] >= wb[1]
                    && a.page[1] < wb[1] + CLOUD_SHADOW_PAGES;
                if (stays) expect(b.page).toEqual(a.page);
            }
            expect(slots.size).toBe(CLOUD_SHADOW_SLOT_COUNT);
            expect(active).toBe(CLOUD_SHADOW_LEVELS * CLOUD_SHADOW_PAGES * nx);
            // A razão do degrau da elevação e as páginas da janela à direita (as físicas são o orçamento do sol rasante).
            expect(shadowAspect(0, f.sun)).toBe(ratio);
            expect(nx).toBe(pagesX);
        }
        expect(CLOUD_SHADOW_SLOT_COUNT).toBeLessThanOrEqual(
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
            expect((shadowPagesX(r) / 2 - 1) * CLOUD_SHADOW_PAGE).toBeGreaterThanOrEqual(
                useful / r + 2,
            );
            expect(shadowPagesX(r)).toBeLessThanOrEqual(CLOUD_SHADOW_PAGES_X);
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

    it('no degrau a página desenhada com a outra razão não vale; entre degraus o sol que anda não a invalida por isso', () => {
        // Arrange
        const at = (el: number) => frameOf(sunOf(el, 10));
        // Act / Assert
        expect(shadowAspectCurrent(at(18.9), sunOf(19.1, 10))).toBe(false);
        expect(shadowAspectCurrent(at(9.9), sunOf(9.7, 10))).toBe(false);
        expect(shadowAspectCurrent(at(15), sunOf(11, 10))).toBe(true);
        expect(shadowAspectCurrent(at(30), sunOf(80, 10))).toBe(true);
        expect(shadowAspectCurrent(at(4), sunOf(-0.5, 10))).toBe(true);
        // O texel da janela segue a razão: à direita × r, em cima o do nível.
        for (const el of [60, 12, 4]) {
            const f = at(el);
            const r = shadowAspect(0, f.sun);
            const x: [number, number] = [f.camera[0] + 333, f.camera[1] - 211];
            const w = shadowWindow(f, 0);
            const p = shadowAtlasTexel(f, x, 0);
            const g = [
                Math.floor((x[0] / (50 * r) - 0.5) / CLOUD_SHADOW_PAGE),
                Math.floor((x[1] / 50 - 0.5) / CLOUD_SHADOW_PAGE),
            ] as [number, number];
            const o = shadowSlotOrigin(shadowSlot(0, g));
            expect(p[0] - o[0]).toBeCloseTo(x[0] / (50 * r) - g[0] * CLOUD_SHADOW_PAGE, 9);
            expect(p[1] - o[1]).toBeCloseTo(x[1] / 50 - g[1] * CLOUD_SHADOW_PAGE, 9);
            expect(g[0] - w[0]).toBeLessThan(shadowPagesX(r));
        }
    });

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
                    const slot = shadowSlot(level, [0, 0]);
                    void slot;
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
                            (w[0] + shadowPagesX(shadowAspect(0, f.sun))) * CLOUD_SHADOW_PAGE - 0.5,
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
                slot: shadowSlot(p.k, p.g),
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
            wanted.sort((a, b) => b.priority - a.priority || a.i - b.i);
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
