import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../cloudModel';
import {
    CLOUD_SCATTER_KEY_FRESH,
    CLOUD_SCATTER_SUN_MEMORY,
    scatterChange,
    scatterPageKey,
    scatterPagePaths,
    scatterPanoramaRedo,
    scatterSpacing,
    type ScatterNow,
    type ScatterPage,
    type ScatterSeen,
} from '../cloudScatterPages';

// O orçamento por necessidade do cache de espalhamento e do panorama (spec 041, T074): a mudança do que o registro guarda,
// a fila da escolha e o panorama, numa simulação da escolha do quadro como a GPU a faz (as filas da maior à menor, dentro
// da fila do corte pela ordem da página).

const WINDOW = 64;
const COS_CUT = Math.cos((2 * Math.PI) / 180);

const sunAt = (deg: number): Vec3 => {
    const e = (deg * Math.PI) / 180;
    return [Math.cos(e), Math.sin(e), 0];
};

const nowOf = (o: Partial<ScatterNow> = {}): ScatterNow => ({
    sun: sunAt(30),
    offset: [0, 0],
    eye: [0, 2, 0],
    time: 0,
    signature: 7,
    cosCut: COS_CUT,
    evolution: 0,
    ...o,
});

const seenOf = (n: ScatterNow): ScatterSeen => ({
    sun: n.sun,
    offset: n.offset,
    eye: n.eye,
    time: n.time,
    signature: n.signature,
});

describe('cache de espalhamento por necessidade: a mudança', () => {
    it('nada muda com o quadro igual; cada termo dá a fração esperada', () => {
        // Arrange
        const now = nowOf();
        const at: Vec3 = [3000, 2000, 0];
        const seen = seenOf(now);
        // Act
        const still = scatterChange(seen, now, at, 100);
        const sun = scatterChange(seen, nowOf({ sun: sunAt(30.1) }), at, 100);
        const wind = scatterChange(seen, nowOf({ offset: [5, 0] }), at, 100);
        const evolve = scatterChange(seen, nowOf({ time: 30, evolution: 600 }), at, 100);
        const content = scatterChange(seen, nowOf({ signature: 8 }), at, 100);
        // Assert
        expect(still).toBe(0);
        expect(sun).toBeCloseTo(1 - Math.exp(-((0.1 * Math.PI) / 180) / CLOUD_SCATTER_SUN_MEMORY), 9);
        expect(wind).toBeCloseTo(0.05, 12);
        expect(evolve).toBeCloseTo(0.05, 12);
        expect(content).toBe(1);
    });

    it('a câmera que anda muda a sonda pelo ângulo da direção dela pelo corte da fase', () => {
        // Arrange: a sonda a 1 km; a câmera anda 1 m de lado.
        const now = nowOf({ eye: [1, 0, 0] });
        const seen = seenOf(nowOf({ eye: [0, 0, 0] }));
        // Act
        const c = scatterChange(seen, now, [0, 1000, 0], 100);
        // Assert: ~1 mrad sobre o corte de 2°.
        expect(c).toBeCloseTo(0.001 / ((2 * Math.PI) / 180), 4);
    });
});

/** Uma grade de páginas: a posição do centro de cada uma, se tem nuvem, e o registro. */
interface SimPage extends ScatterPage {
    readonly at: Vec3;
}

/**
 * `frames` quadros da escolha com `budget` páginas por quadro: o quadro `now(f)`, as páginas escolhidas caminham (o
 * esquecimento do sol, os caminhos efetivos, o registro). Devolve as escolhidas por quadro e a maior idade das páginas
 * com nuvem na escolha (depois de cheias).
 */
function simulate(
    count: number,
    budget: number,
    frames: number,
    now: (f: number) => ScatterNow,
): { chosen: number[]; worst: number; pages: SimPage[] } {
    let pages: SimPage[] = [];
    for (let i = 0; i < count; i++) {
        const a = ((i % 40) + 0.5) / 40 * 2 - 1;
        pages.push({
            at: [64_000 * Math.sinh(4.16 * a) / 32, 2000, 0],
            cloudy: (i * 2654435761) % 7 < 4,
            paths: 0,
            frame: 0,
            current: false,
            seen: seenOf(now(0)),
        });
    }
    const chosen: number[] = [];
    let worst = 0;
    for (let f = 1; f <= frames; f++) {
        const n = now(f);
        const keyed = pages
            .map((p, i) => ({ i, k: scatterPageKey(p, n, f, p.at, 100, WINDOW, true) }))
            .filter((x) => x.k > 0)
            .sort((a, b) => b.k - a.k || a.i - b.i)
            .slice(0, budget);
        chosen.push(keyed.length);
        const next = [...pages];
        for (const { i } of keyed) {
            const p = pages[i]!;
            const forget = p.current
                ? Math.exp(
                      -2 * Math.asin(Math.min(0.5 * Math.hypot(...p.seen.sun.map((v, k) => v - n.sun[k]!)), 1))
                          / CLOUD_SCATTER_SUN_MEMORY,
                  )
                : 0;
            next[i] = {
                ...p,
                paths: scatterPagePaths(p.current ? p.paths : 0, forget, WINDOW),
                frame: f,
                current: true,
                seen: seenOf(n),
            };
        }
        pages = next;
        if (f > frames / 2)
            for (const p of pages) if (p.cloudy) worst = Math.max(worst, f - p.frame);
    }
    return { chosen, worst, pages };
}

describe('cache de espalhamento por necessidade: a escolha do quadro', () => {
    it('parado, as páginas enchem a janela e depois nenhuma caminha', () => {
        // Arrange: 1600 páginas, 200 por quadro (o alto), nada se move.
        // Act
        const r = simulate(1600, 200, 800, () => nowOf());
        // Assert
        expect(r.pages.every((p) => p.current)).toBe(true);
        expect(r.pages.filter((p) => p.cloudy).every((p) => p.paths === WINDOW)).toBe(true);
        expect(r.chosen.slice(-100).every((c) => c === 0)).toBe(true);
        // A janela cheia leva páginas com nuvem × janela ÷ orçamento quadros (mais a primeira passada).
        const cloudy = r.pages.filter((p) => p.cloudy).length;
        const filled = r.chosen.findIndex((c, k) => k > 8 && c === 0);
        expect(filled).toBeLessThanOrEqual(Math.ceil((cloudy * WINDOW) / 200) + 16);
    });

    it('com o sol andando, todas caminham no teto e nenhuma com nuvem espera muito mais que páginas ÷ orçamento', () => {
        // Arrange: o sol a 1,3°/s (o `high-sun`), 1/60 s por quadro.
        // Act
        const r = simulate(1600, 200, 600, (f) => nowOf({ sun: sunAt(8 - (f * 1.3) / 60) }));
        // Assert
        expect(r.chosen.slice(10).every((c) => c === 200)).toBe(true);
        expect(r.worst).toBeLessThanOrEqual(4 * (1600 / 200));
    });

    it('com o vento, a página caminha quando as nuvens andam 1/janela do espaçamento', () => {
        // Arrange: 10 m/s, sondas de 100 m: 1/64 de 100 m a cada ~9,4 quadros de 1/60 s.
        const page: ScatterPage = {
            seen: seenOf(nowOf()),
            cloudy: true,
            paths: WINDOW,
            frame: 0,
            current: true,
        };
        const at: Vec3 = [0, 2000, 0];
        // Act
        const first = [...Array(20).keys()].find(
            (f) => scatterPageKey(page, nowOf({ offset: [(10 * f) / 60, 0] }), f, at, 100, WINDOW, true) > 0,
        );
        // Assert
        expect(first).toBe(10);
        expect(scatterPageKey({ ...page, current: false }, nowOf(), 1, at, 100, WINDOW, true)).toBe(
            CLOUD_SCATTER_KEY_FRESH,
        );
    });

    it('o panorama é refeito só quando o cache caminha, a série não vale ou o que viu mudou', () => {
        // Arrange
        const now = nowOf();
        const seen = seenOf(now);
        // Act / Assert
        expect(scatterPanoramaRedo(true, false, seen, now, 100, WINDOW)).toBe(false);
        expect(scatterPanoramaRedo(false, false, seen, now, 100, WINDOW)).toBe(true);
        expect(scatterPanoramaRedo(true, true, seen, now, 100, WINDOW)).toBe(true);
        expect(scatterPanoramaRedo(true, false, seen, nowOf({ sun: sunAt(30.01) }), 100, WINDOW)).toBe(true);
        expect(scatterPanoramaRedo(true, false, seen, nowOf({ eye: [0.01, 2, 0] }), 100, WINDOW)).toBe(
            false,
        );
    });

    it('o espaçamento é a derivada da posição da sonda', () => {
        // Arrange
        const x0 = 2000;
        const reach = Math.asinh(32);
        const n = 160;
        const at = (a: number): number => x0 * Math.sinh(reach * a);
        // Act
        const a = 0.3;
        // Uma sonda: Δa = 2/n.
        const numeric = at(a + 1 / n) - at(a - 1 / n);
        // Assert
        expect(scatterSpacing(x0, reach, a, n)).toBeCloseTo(numeric, 0);
    });
});
