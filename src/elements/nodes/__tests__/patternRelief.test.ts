import { describe, expect, it } from 'vitest';
import { patternCells, patternGrain, patternRings, patternWeave } from '../reference/pattern';
import { surfaceBump, surfaceUvSpace } from '../reference/surface';

// Padrões com relevo (spec 011): o gradiente analítico de cada padrão contra a diferença finita da altura dele, o
// fechamento sem emenda no período (`wrap`), a média abaixo do pixel (`width`) e a normal de `surface.bump`. A GPU é
// conferida contra estas mesmas referências no smoke `nodeGraphs` (parte f).

const f32 = Math.fround;
/** Pontos de teste em f32 com frações diádicas (a coordenada vezes a frequência é exata). */
const POINTS: readonly (readonly [number, number])[] = Array.from({ length: 60 }, (_, k) => [
    f32(-3.7 + 0.1337 * k),
    f32(2.9 - 0.0913 * k * 1.7),
]);

/** Diferença central de `h` em `p` com passo `e` (em f32 exato: potência de 2). */
function numeric(h: (p: readonly [number, number]) => number, p: readonly [number, number]) {
    const e = 1 / 4096;
    return [
        (h([p[0] + e, p[1]]) - h([p[0] - e, p[1]])) / (2 * e),
        (h([p[0], p[1] + e]) - h([p[0], p[1] - e])) / (2 * e),
    ];
}

/** Confere o gradiente analítico nos pontos em que a altura é suave na vizinhança do passo. */
function checkGradient(
    sample: (p: readonly [number, number]) => { h: number; g: readonly number[] },
    tolerance: number,
    least: number,
): void {
    let checked = 0;
    for (const p of POINTS) {
        const here = sample(p);
        const n = numeric((q) => sample(q).h, p);
        // Segunda diferença grande: uma quina do padrão (borda de célula, de fio ou de anel) dentro do passo.
        const e = 1 / 4096;
        const curve =
            Math.abs(sample([p[0] + e, p[1]]).h + sample([p[0] - e, p[1]]).h - 2 * here.h)
            + Math.abs(sample([p[0], p[1] + e]).h + sample([p[0], p[1] - e]).h - 2 * here.h);
        if (curve > 2e-4) continue;
        checked++;
        expect(here.g[0]).toBeCloseTo(n[0]!, tolerance);
        expect(here.g[1]).toBeCloseTo(n[1]!, tolerance);
    }
    expect(checked).toBeGreaterThanOrEqual(least);
}

describe('padrões com relevo (spec 011)', () => {
    it('grão: gradiente = derivada do valor; anisotropia pela escala por eixo', () => {
        checkGradient(
            (p) => {
                const o = patternGrain(p, 0, [0, 0], [2, 8], 3, 3, 2, 0.5);
                return { h: o.value, g: o.gradient };
            },
            2,
            40,
        );
        // Escala (1, 64): ao longo de x o valor muda devagar, ao longo de y depressa — riscos ao longo de x.
        let along = 0;
        let across = 0;
        for (const p of POINTS) {
            const g = patternGrain(p, 0, [0, 0], [1, 64], 0, 1, 2, 0.5).gradient;
            along += Math.abs(g[0]!);
            across += Math.abs(g[1]!);
        }
        expect(across).toBeGreaterThan(20 * along);
    });

    it('grão, células e trama fecham no período; os anéis fecham ao longo da fibra', () => {
        for (const p of POINTS.slice(0, 20)) {
            const q = [p[0] + 2, p[1] + 4] as const;
            const a = patternGrain(p, 0, [2, 4], [2.3, 5.1], 1, 3, 2, 0.5);
            const b = patternGrain(q, 0, [2, 4], [2.3, 5.1], 1, 3, 2, 0.5);
            expect(b.value).toBeCloseTo(a.value, 4);
            const c = patternCells(p, 0, [2, 4], 3.3, 0.9, 0.2, 2);
            const d = patternCells(q, 0, [2, 4], 3.3, 0.9, 0.2, 2);
            expect(d.height).toBeCloseTo(c.height, 4);
            expect(d.cell).toBe(c.cell);
            // Sarja 3/1: o número de fios no período é múltiplo de 4.
            const e = patternWeave(p, 0, [2, 4], 5.3, 3, 1, 1, 0.1, 0);
            const f = patternWeave(q, 0, [2, 4], 5.3, 3, 1, 1, 0.1, 0);
            expect(f.height).toBeCloseTo(e.height, 4);
            expect(f.warp).toBe(e.warp);
            expect(f.thread).toBe(e.thread);
            const g = patternRings(p, 0, [2, 0], 6, 0.3, 0.2, [1.3, 0.7], 0);
            const h = patternRings([p[0] + 2, p[1]], 0, [2, 0], 6, 0.3, 0.2, [1.3, 0.7], 0);
            expect(h.value).toBeCloseTo(g.value, 3);
        }
    });

    it('células: altura 0 no sulco e 1 no platô; gradiente = derivada da altura', () => {
        let low = 1;
        let high = 0;
        for (const p of POINTS) {
            const h = patternCells(p, 0, [0, 0], 2, 0.8, 0.15, 0).height;
            low = Math.min(low, h);
            high = Math.max(high, h);
        }
        expect(low).toBeLessThan(0.3);
        expect(high).toBe(1);
        checkGradient(
            (p) => {
                const o = patternCells(p, 0, [0, 0], 2, 0.8, 0.6, 1);
                return { h: o.height, g: o.gradient };
            },
            2,
            25,
        );
    });

    it('anéis: perfil em [0, 1], tom por anel, gradiente = derivada do perfil', () => {
        const tones = new Set<number>();
        for (const p of POINTS) {
            const o = patternRings(p, 0, [0, 0], 4, 0.3, 0.15, [1.5, 0.75], 0);
            expect(o.value).toBeGreaterThanOrEqual(0);
            expect(o.value).toBeLessThanOrEqual(1);
            tones.add(o.ring);
        }
        expect(tones.size).toBeGreaterThan(5);
        checkGradient(
            (p) => {
                const o = patternRings(p, 0, [0, 0], 2, 0.4, 0.2, [1, 0.5], 2);
                return { h: o.value, g: o.gradient };
            },
            1,
            30,
        );
    });

    it('trama: tela alterna urdidura e trama; a sarja 3/1 mostra três quartos de urdidura na diagonal', () => {
        // No centro de cada cruzamento o fio de cima está à vista, na altura 1.
        const at = (i: number, j: number, over: number, under: number, shift: number) =>
            patternWeave([i + 0.5, j + 0.5], 0, [0, 0], 1, over, under, shift, 0.1, 0);
        for (let j = 0; j < 4; j++)
            for (let i = 0; i < 4; i++) {
                const plain = at(i, j, 1, 1, 1);
                expect(plain.warp).toBe((i + j) % 2 === 0 ? 1 : 0);
                expect(plain.height).toBe(1);
                expect(at(i, j, 3, 1, 1).warp).toBe((i + j) % 4 < 3 ? 1 : 0);
            }
        // O vão: no canto do cruzamento, fora dos dois fios.
        expect(patternWeave([0.01, 0.01], 0, [0, 0], 1, 1, 1, 1, 0.3, 0).gap).toBe(1);
        expect(patternWeave([0.5, 0.5], 0, [0, 0], 1, 1, 1, 1, 0.3, 0).gap).toBe(0);
        checkGradient(
            (p) => {
                const o = patternWeave(p, 0, [0, 0], 2, 3, 1, 1, 0.1, 0);
                return { h: o.height, g: o.gradient };
            },
            2,
            25,
        );
    });

    it('abaixo do pixel o detalhe vai à média e o gradiente a zero', () => {
        const p = POINTS[7]!;
        const weave = patternWeave(p, 4, [0, 0], 8, 3, 1, 1, 0.2, 0);
        expect(weave.height).toBe(0.5);
        expect(weave.warp).toBe(0.75);
        expect(weave.thread).toBe(0.5);
        expect(weave.gap).toBeCloseTo(0.04, 12);
        expect(weave.gradient.map(Math.abs)).toEqual([0, 0]);
        const cells = patternCells(p, 4, [0, 0], 8, 1, 0.2, 0);
        expect(cells.height).toBeCloseTo(0.8, 12);
        expect(cells.cell).toBe(0.5);
        expect(cells.gradient.map(Math.abs)).toEqual([0, 0]);
        expect(cells.random.map(Math.abs)).toEqual([0, 0]);
        const rings = patternRings(p, 4, [0, 0], 8, 0.3, 0.1, [1, 1], 0);
        expect(rings.value).toBe(0.59);
        expect(rings.ring).toBe(0.5);
        const grain = patternGrain(p, 4, [0, 0], [8, 8], 0, 3, 2, 0.5);
        expect(Math.abs(grain.value)).toBe(0);
    });

    it('uvSpace: coordenada, largura, tangentes e período pela escala e pelo deslocamento', () => {
        const o = surfaceUvSpace(
            [0.25, 0.5],
            [0.01, 0],
            [0, 0.02],
            [2, 0, 0],
            [0, 0, 3],
            [4, 2],
            [0.5, -1],
        );
        expect(o.p).toEqual([1.5, 0]);
        expect(o.width).toBeCloseTo(0.04, 12);
        expect(o.du).toEqual([0.5, 0, 0]);
        expect(o.dv).toEqual([0, 0, 1.5]);
        expect(o.wrap).toEqual([4, 2]);
    });

    it('bump: inclina a normal contra o gradiente; sem tangentes, a normal; o relevo não depende do tamanho', () => {
        const n = [0, 0, 1];
        const flat = surfaceBump(n, [1, 0, 0], [0, 1, 0], [0, 0], 1);
        expect(flat).toEqual(n);
        // A altura sobe em +u: a normal inclina para −u; inclinação = strength · gradiente.
        const tilted = surfaceBump(n, [1, 0, 0], [0, 1, 0], [0.5, 0], 1);
        expect(tilted[0]! / tilted[2]!).toBeCloseTo(-0.5, 12);
        expect(tilted[1]).toBeCloseTo(0, 12);
        // O mesmo padrão num objeto dez vezes maior (tangentes dez vezes maiores): a mesma normal.
        const big = surfaceBump(n, [10, 0, 0], [0, 10, 0], [0.5, 0], 1);
        expect(big[0]).toBeCloseTo(tilted[0]!, 12);
        // uv espelhado (referencial de mão esquerda): a mesma inclinação.
        const mirrored = surfaceBump(n, [1, 0, 0], [0, -1, 0], [0.5, 0], 1);
        expect(mirrored[0]).toBeCloseTo(tilted[0]!, 12);
        expect(surfaceBump(n, [0, 0, 0], [0, 0, 0], [3, 3], 1)).toEqual(n);
    });
});
