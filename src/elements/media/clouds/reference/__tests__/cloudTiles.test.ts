import { describe, expect, it } from 'vitest';
import {
    COMPOSE_EPS,
    composeScreen,
    composeTiles,
    tileList,
    tileMarks,
    type Rgba,
} from '../cloudTiles';

/** Um gerador determinístico em [0, 1). */
function rng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 2 ** 32;
    };
}

function image(width: number, height: number, fill: (o: number) => number): Rgba {
    const data = new Float64Array(width * height * 4);
    for (let o = 0; o < data.length; o++) data[o] = fill(o);
    return { width, height, data };
}

/**
 * A nuvem aumentada esparsa: manchas de nuvem (T < 1, luz) em céu limpo (T = 1, luz 0), mais pixels isolados com luz
 * abaixo da precisão (o que o passe de desenho descarta por pixel).
 */
function sparseView(width: number, height: number, white: number, seed: number): Rgba {
    const r = rng(seed);
    const view = image(width, height, (o) => (o % 4 === 3 ? 1 : 0));
    const blobs = Array.from({ length: 5 }, () => [r() * width, r() * height, 2 + r() * 9] as const);
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const o = (y * width + x) * 4;
            for (const [cx, cy, rad] of blobs)
                if (Math.hypot(x - cx, y - cy) < rad) {
                    view.data[o + 3] = 0.2 + 0.7 * r();
                    for (let c = 0; c < 3; c++) view.data[o + c] = white * 0.3 * r();
                }
            if (view.data[o + 3] === 1 && r() < 0.02)
                for (let c = 0; c < 3; c++) view.data[o + c] = COMPOSE_EPS * white * 0.5 * r();
        }
    return view;
}

describe('a lista dos blocos da composição das nuvens (T074)', () => {
    it('compor só nos blocos da lista dá a composição da tela inteira, a menos da luz abaixo da precisão', () => {
        // Arrange: telas que não são múltiplas do bloco, várias sementes.
        const white = 30_000;
        const tile = 8;
        for (const [w, h, seed] of [
            [83, 61, 1],
            [64, 48, 2],
            [97, 33, 3],
        ] as const) {
            const view = sparseView(w, h, white, seed);
            const r = rng(seed + 100);
            const color = image(w, h, () => 1000 * r());
            const light = image(w, h, (o) => (o % 4 < 2 ? 500 * r() : 0));
            const screen = { color: image(w, h, (o) => color.data[o]!), light: image(w, h, (o) => light.data[o]!) };
            const tiles = { color: image(w, h, (o) => color.data[o]!), light: image(w, h, (o) => light.data[o]!) };
            // Act
            composeScreen(screen.color, screen.light, view);
            const tw = Math.ceil(w / tile);
            const th = Math.ceil(h / tile);
            const list = tileList(tileMarks(view, tile, white), tw, th);
            composeTiles(tiles.color, tiles.light, view, tile, list);
            // Assert: fora da lista, só a luz abaixo da precisão (por canal, ≤ 2⁻¹² × branco) e o Y da passa-baixa dela.
            expect(list.length).toBeGreaterThan(0);
            expect(list.length).toBeLessThan(tw * th);
            for (let o = 0; o < screen.color.data.length; o++) {
                const tol = COMPOSE_EPS * white;
                expect(Math.abs(tiles.color.data[o]! - screen.color.data[o]!)).toBeLessThanOrEqual(tol);
                expect(Math.abs(tiles.light.data[o]! - screen.light.data[o]!)).toBeLessThanOrEqual(tol);
            }
        }
    });

    it('a passa-baixa da luz (3 × 3 a 3 pixels) alcança o bloco vizinho: sem a dilatação, a composição erra', () => {
        // Arrange: uma nuvem só na última coluna de um bloco; o vizinho à direita sem nuvem.
        const white = 30_000;
        const tile = 8;
        const w = 32;
        const h = 8;
        const view = image(w, h, (o) => (o % 4 === 3 ? 1 : 0));
        for (let y = 0; y < h; y++) {
            const o = (y * w + 7) * 4;
            view.data[o + 3] = 0.1;
            view.data[o] = view.data[o + 1] = view.data[o + 2] = 0.2 * white;
        }
        const marks = tileMarks(view, tile, white);
        // Act
        const list = tileList(marks, w / tile, h / tile);
        const own = [...marks].flatMap((m, i) => (m === 1 ? [[i, 0] as [number, number]] : []));
        const lit = (l: readonly (readonly [number, number])[]): Rgba => {
            const color = image(w, h, () => 100);
            const light = image(w, h, (o) => (o % 4 < 2 ? 50 : 0));
            composeTiles(color, light, view, tile, l);
            return light;
        };
        const screenLight = image(w, h, (o) => (o % 4 < 2 ? 50 : 0));
        composeScreen(image(w, h, () => 100), screenLight, view);
        // Assert: a lista leva o bloco vizinho (o 1) e acerta a luz no pixel 10 (a 3 px da nuvem); só a marca, não.
        expect(list.map(([x]) => x)).toEqual([0, 1]);
        const o = 10 * 4;
        expect(lit(list).data[o]).toBeCloseTo(screenLight.data[o]!, 9);
        expect(Math.abs(lit(own).data[o]! - screenLight.data[o]!)).toBeGreaterThan(1);
    });

    it('sem nuvem na tela (a sala fechada), nenhum bloco', () => {
        const view = image(40, 24, (o) => (o % 4 === 3 ? 1 : 0));
        expect(tileList(tileMarks(view, 8, 30_000), 5, 3)).toEqual([]);
    });
});
