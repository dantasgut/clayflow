import { describe, expect, it } from 'vitest';
import { calibrationCloud } from '../calibrationScene';
import type { Vec3 } from '../cloudModel';
import {
    scatterCarryWeight,
    scatterGridCenter,
    scatterNormalize,
    scatterProbePosition,
    scatterRecompose,
    type ScatterGrid,
} from '../cloudScatter';
import {
    CLOUD_PANORAMA_TOLERANCE,
    CLOUD_SCATTER_KEY_FRESH,
    CLOUD_SCATTER_SUN_MEMORY,
    CLOUD_SCATTER_VIEW_MEMORY,
    scatterChange,
    scatterChoose,
    scatterForget,
    scatterPageKey,
    scatterPageMotion,
    scatterPagePaths,
    scatterPanoramaChange,
    scatterPanoramaRedo,
    scatterSpacing,
    type ScatterNow,
    type ScatterPage,
    type ScatterSeen,
} from '../cloudScatterPages';

// O orçamento por necessidade do cache de espalhamento e do panorama (spec 041, T074): a mudança do que o registro guarda
// (o sol e a câmera pelas memórias medidas, o vento que sobra além do referencial das nuvens, a evolução, o conteúdo), a
// escolha do quadro (as de encher e as da mudança, cada uma no seu orçamento) numa simulação como a GPU a faz, a luz
// guardada em partes, a grade no referencial das nuvens e o transporte quando o centro muda, e o panorama pela mudança
// medida.

const WINDOW = 64;
const DEG = Math.PI / 180;

const sunAt = (deg: number): Vec3 => {
    const e = deg * DEG;
    return [Math.cos(e), Math.sin(e), 0];
};

const nowOf = (o: Partial<ScatterNow> = {}): ScatterNow => ({
    sun: sunAt(30),
    eye: [0, 2, 0],
    time: 0,
    signature: 7,
    evolution: 0,
    extraWind: 0,
    ...o,
});

const seenOf = (n: ScatterNow): ScatterSeen => ({
    sun: n.sun,
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
        const extra = scatterChange(seen, nowOf({ time: 1, extraWind: 5 }), at, 100);
        const evolve = scatterChange(seen, nowOf({ time: 30, evolution: 600 }), at, 100);
        const content = scatterChange(seen, nowOf({ signature: 8 }), at, 100);
        // Assert
        expect(still).toBe(0);
        expect(sun).toBeCloseTo(1 - Math.exp(-(0.1 * DEG) / CLOUD_SCATTER_SUN_MEMORY), 9);
        expect(extra).toBeCloseTo(0.05, 12);
        expect(evolve).toBeCloseTo(0.05, 12);
        expect(content).toBe(1);
    });

    it('o vento das nuvens não muda a página (a grade anda com elas); só o que sobra além dele', () => {
        // Arrange: 10 s de vento de 10 m/s, sem o vento de cima.
        const seen = seenOf(nowOf());
        // Act
        const wind = scatterChange(seen, nowOf({ time: 10 }), [0, 2000, 0], 100);
        // Assert
        expect(wind).toBe(0);
    });

    it('a câmera que anda esquece pelo ângulo da direção dela pela memória da câmera', () => {
        // Arrange: a sonda a 1 km; a câmera anda 1 m de lado.
        const now = nowOf({ eye: [1, 0, 0] });
        const seen = seenOf(nowOf({ eye: [0, 0, 0] }));
        // Act
        const c = scatterChange(seen, now, [0, 1000, 0], 100);
        const f = scatterForget(seen, now, [0, 1000, 0]);
        // Assert: ~1 mrad.
        expect(c).toBeCloseTo(1 - Math.exp(-0.001 / CLOUD_SCATTER_VIEW_MEMORY), 6);
        expect(f).toBeCloseTo(1 - c, 12);
    });
});

/** Uma grade de páginas: a posição do centro de cada uma, se tem nuvem, e o registro. */
interface SimPage extends ScatterPage {
    readonly at: Vec3;
}

/**
 * `frames` quadros da escolha (`budget` páginas para encher, `motion` pela mudança): o quadro `now(f)`, as páginas
 * escolhidas caminham (o esquecimento, os caminhos efetivos, o registro). Devolve as escolhidas por quadro, a maior
 * idade das páginas com nuvem (na segunda metade) e as páginas.
 */
function simulate(
    count: number,
    budget: number,
    motion: number,
    frames: number,
    now: (f: number) => ScatterNow,
): { chosen: number[]; worst: number; pages: SimPage[] } {
    let pages: SimPage[] = [];
    for (let i = 0; i < count; i++) {
        const a = (((i % 40) + 0.5) / 40) * 2 - 1;
        pages.push({
            at: [(64_000 * Math.sinh(4.16 * a)) / 32, 2000, 0],
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
        const picks = scatterChoose(
            pages.map((p) => ({
                key: scatterPageKey(p, n, f, p.at, 100, WINDOW, true),
                motion: scatterPageMotion(p, n, p.at, 100),
            })),
            budget,
            motion,
        );
        chosen.push(picks.length);
        const next = [...pages];
        for (const i of picks) {
            const p = pages[i]!;
            const forget = p.current ? scatterForget(p.seen, n, p.at) : 0;
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
    it('parado, as páginas enchem a janela no orçamento de encher e depois nenhuma caminha', () => {
        // Arrange: 1600 páginas, 200 para encher e 40 pela mudança (o alto), nada se move.
        // Act
        const r = simulate(1600, 200, 40, 800, () => nowOf());
        // Assert
        expect(r.pages.every((p) => p.current)).toBe(true);
        expect(r.pages.filter((p) => p.cloudy).every((p) => p.paths === WINDOW)).toBe(true);
        expect(r.chosen.slice(-100).every((c) => c === 0)).toBe(true);
        const cloudy = r.pages.filter((p) => p.cloudy).length;
        const filled = r.chosen.findIndex((c, k) => k > 8 && c === 0);
        expect(filled).toBeLessThanOrEqual(Math.ceil((cloudy * WINDOW) / 200) + 16);
    });

    it('com o sol no ciclo de um jogo, só o orçamento da mudança caminha e as páginas guardam ~a memória de caminhos', () => {
        // Arrange: o sol a 0,25°/s descendo de 8°, 1/60 s por quadro; cheias antes (parado).
        const rate = 0.25 / 60;
        const fill = 700;
        // Act
        const r = simulate(1600, 200, 40, fill + 1200, (f) =>
            nowOf({ sun: sunAt(8 - Math.max(f - fill, 0) * rate) }),
        );
        // Assert: no regime, 40 por quadro (o teto da mudança), nenhuma com nuvem esperando mais que ~3 voltas.
        const steady = r.chosen.slice(fill + 200);
        expect(steady.every((c) => c <= 40)).toBe(true);
        expect(steady.reduce((a, b) => a + b, 0) / steady.length).toBeGreaterThan(39);
        expect(r.worst).toBeLessThanOrEqual(3 * (1600 / 40));
        // Os caminhos efetivos: a memória (1,14°) ÷ o sol entre dois caminhos de uma página (~páginas/40 quadros).
        const cloudy = r.pages.filter((p) => p.cloudy);
        const mean = cloudy.reduce((a, p) => a + p.paths, 0) / cloudy.length;
        expect(mean).toBeGreaterThan(4);
        expect(mean).toBeLessThan(WINDOW);
    });

    it('a página nova vai à fila de cima; com o vento que sobra, caminha quando ele anda 1/janela do espaçamento', () => {
        // Arrange: 5 m/s além do referencial das nuvens, sondas de 100 m: 1/64 de 100 m a cada ~18,75 quadros de 1/60 s.
        const page: ScatterPage = {
            seen: seenOf(nowOf()),
            cloudy: true,
            paths: WINDOW,
            frame: 0,
            current: true,
        };
        const at: Vec3 = [0, 2000, 0];
        // Act
        const first = [...Array(40).keys()].find(
            (f) =>
                scatterPageKey(
                    page,
                    nowOf({ time: f / 60, extraWind: 5 }),
                    f,
                    at,
                    100,
                    WINDOW,
                    true,
                ) > 0,
        );
        // Assert
        expect(first).toBe(19);
        expect(scatterPageMotion(page, nowOf({ time: 19 / 60, extraWind: 5 }), at, 100)).toBe(true);
        expect(scatterPageMotion(page, nowOf(), at, 100)).toBe(false);
        expect(scatterPageKey({ ...page, current: false }, nowOf(), 1, at, 100, WINDOW, true)).toBe(
            CLOUD_SCATTER_KEY_FRESH,
        );
    });

    it('as de encher passam antes das da mudança, e as da mudança só no orçamento delas', () => {
        // Arrange
        const pages = [
            { key: 3, motion: true },
            { key: 31, motion: false },
            { key: 5, motion: true },
            { key: 2, motion: false },
            { key: 9, motion: true },
        ];
        // Act / Assert
        expect(scatterChoose(pages, 3, 1)).toEqual([1, 3, 4]);
        expect(scatterChoose(pages, 2, 4)).toEqual([1, 3]);
        expect(scatterChoose(pages, 10, 2)).toEqual([1, 3, 4, 2]);
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

describe('cache de espalhamento: a luz em partes, a grade no referencial das nuvens', () => {
    it('a luz guardada volta à mesma com o mesmo sol e céu, e segue a cor do sol de agora na parte do sol', () => {
        // Arrange
        const parts = { sun: [3, 2, 1], sky: [0.4, 0.5, 0.6] };
        const E: Vec3 = [10, 10, 10];
        const T: Vec3 = [0.5, 0.3, 0.1];
        const U: Vec3 = [1, 2, 3];
        // Act
        const q = scatterNormalize(parts, E, T, U);
        const back = scatterRecompose(q, E, T, U);
        const redder = scatterRecompose(q, E, [0.5, 0.15, 0.05], U);
        // Assert
        for (let c = 0; c < 3; c++) expect(back[c]).toBeCloseTo(parts.sun[c]! + parts.sky[c]!, 12);
        expect(redder[0]).toBeCloseTo(back[0], 12);
        expect(redder[1]).toBeCloseTo(parts.sun[1]! / 2 + parts.sky[1]!, 12);
    });

    it('o centro anda com o vento e só troca quando a câmera, no referencial das nuvens, cruza o encaixe', () => {
        // Arrange / Act
        const a = scatterGridCenter([100, 0], [0, 0], 4000);
        const b = scatterGridCenter([100, 0], [1000, 0], 4000);
        const c = scatterGridCenter([100, 0], [2200, 0], 4000);
        // Assert
        expect(a).toEqual([0, 0]);
        expect(b).toEqual([1000, 0]);
        expect(c).toEqual([-1800, 0]);
    });

    it('o transporte: a sonda de antes vale inteira onde era mais fina, menos onde era mais espaçada; fora, zero', () => {
        // Arrange: o centro anda 4 km.
        const m = calibrationCloud;
        const before: ScatterGrid = {
            size: [160, 32, 160],
            center: [0, 0],
            x0: 2000,
            reach: Math.asinh(32),
        };
        const now: ScatterGrid = { ...before, center: [4000, 0] };
        // Act: a sonda de agora no centro (antes a 4 km: em x, sondas de ~233 m contra ~104), a do outro lado do centro de
        // antes (lá a de agora é mais espaçada) e a da borda de fora.
        const near = scatterCarryWeight(now, before, m, scatterProbePosition(m, now, 80, 16, 80));
        const back = scatterCarryWeight(now, before, m, [-1000, 2000, 0]);
        const edge = scatterCarryWeight(now, before, m, scatterProbePosition(m, now, 159, 16, 80));
        // Assert
        // Em x 104/233 m, em z o mesmo: a área de antes 2,2 × a de agora.
        expect(near).toBeGreaterThan(0.4);
        expect(near).toBeLessThan(0.5);
        expect(back).toBe(1);
        expect(edge).toBe(0);
    });
});

describe('o panorama pela mudança medida', () => {
    it('refeito só com a série que não vale, outro conteúdo ou as provas além da tolerância', () => {
        // Arrange: 4 provas (a luminância, a transmitância).
        const drawn: [number, number][] = [
            [1, 0.2],
            [0.5, 0.4],
            [0.25, 0.8],
            [0.001, 1],
        ];
        const same = scatterPanoramaChange(drawn, drawn);
        // Uma prova com 2,8 % do ruído, as outras iguais: 0,014/1,764 = 0,8 % da luz.
        const noisy = scatterPanoramaChange(drawn, [[1.014, 0.2], ...drawn.slice(1)]);
        // A luz toda 3 % acima.
        const brighter = scatterPanoramaChange(
            drawn,
            drawn.map(([l, t]) => [l * 1.03, t] as const),
        );
        // A transmitância de uma prova 0,1 abaixo: 0,025 de média.
        const thicker = scatterPanoramaChange(drawn, [[1, 0.1], ...drawn.slice(1)]);
        // Act / Assert
        expect(same).toBe(0);
        expect(noisy).toBeLessThanOrEqual(CLOUD_PANORAMA_TOLERANCE);
        expect(brighter).toBeGreaterThan(CLOUD_PANORAMA_TOLERANCE);
        expect(thicker).toBeGreaterThan(CLOUD_PANORAMA_TOLERANCE);
        expect(scatterPanoramaRedo(true, true, noisy)).toBe(false);
        expect(scatterPanoramaRedo(true, true, brighter)).toBe(true);
        expect(scatterPanoramaRedo(false, true, 0)).toBe(true);
        expect(scatterPanoramaRedo(true, false, 0)).toBe(true);
    });
});
