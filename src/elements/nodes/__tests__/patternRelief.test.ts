import { describe, expect, it } from 'vitest';
import {
    patternAshlar,
    patternBricks,
    patternCells,
    patternDents,
    patternFissures,
    patternGlints,
    patternGrain,
    patternKnit,
    patternPlanks,
    patternRings,
    patternShingles,
    patternThreshold,
    patternVeins,
    patternAreoles,
    patternBrush,
    patternWeave,
} from '../reference/pattern';
import { glintCount } from '../../material/reference/closureNodes';
import {
    surfaceBump,
    surfaceDirection,
    surfaceDisplacement,
    surfaceRelief,
    surfaceReliefNormal,
    surfaceUvSpace,
} from '../reference/surface';

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

    it('anéis: largura irregular de ano para ano e raio ondulado, com o gradiente da derivada', () => {
        checkGradient(
            (p) => {
                const o = patternRings(p, 0, [0, 0], 1, 0.4, 0.2, [1, 0.5], 2, 0.9, 0.04, [1, 2]);
                return { h: o.value, g: o.gradient };
            },
            1,
            30,
        );
        // Ao longo de y (longe da medula, sem distorção nem ondulação): a largura de cada anel pela troca do tom.
        const widths = (irregularity: number): number[] => {
            const out: number[] = [];
            let last = patternRings([0, 1], 0, [0, 0], 8, 0, 0, [1, 1], 0, irregularity).ring;
            let start = 1;
            for (let y = 1; y < 6; y += 1 / 1024) {
                const tone = patternRings([0, y], 0, [0, 0], 8, 0, 0, [1, 1], 0, irregularity).ring;
                if (tone === last) continue;
                out.push(y - start);
                start = y;
                last = tone;
            }
            return out.slice(1);
        };
        const even = widths(0);
        const uneven = widths(1);
        expect(Math.max(...even) / Math.min(...even)).toBeLessThan(1.05);
        expect(Math.max(...uneven) / Math.min(...uneven)).toBeGreaterThan(1.5);
        // Em média, os mesmos `scale` anéis por unidade (± 1 anel de deslocamento em 5 unidades).
        expect(Math.abs(uneven.length - even.length)).toBeLessThanOrEqual(2);
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
        expect(rings.value).toBeCloseTo(0.59, 12);
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

    it('tricô: pontos em V espelhados na coluna, altura em [0, 1], gradiente = derivada, fecha no período', () => {
        checkGradient(
            (p) => {
                const k = patternKnit(p, 0, [0, 0], 2, 1.5, 0.9, 3);
                return { h: k.height, g: k.gradient };
            },
            3,
            12,
        );
        for (const p of POINTS) {
            const k = patternKnit(p, 0, [0, 0], 2, 1.5, 0.9, 3, 0.4);
            expect(k.height).toBeGreaterThanOrEqual(0);
            expect(k.height).toBeLessThanOrEqual(1);
            expect(k.strand).toBeGreaterThanOrEqual(0);
            expect(k.strand).toBeLessThanOrEqual(1);
            expect(Math.hypot(k.fiber[0]!, k.fiber[1]!)).toBeGreaterThan(0.5);
            // Sem fio (o fundo): sem altura e `gap` 1; com fio, `gap` 0.
            expect(k.gap).toBe(k.height > 0 ? 0 : 1);
        }
        // As duas pernas do ponto: espelhadas em torno do meio da coluna (x = 0,5 da célula), a fibra para lados opostos.
        const left = patternKnit([0.2, 0.3], 0, [0, 0], 1, 1, 1, 0);
        const right = patternKnit([0.8, 0.3], 0, [0, 0], 1, 1, 1, 0);
        expect(left.height).toBeCloseTo(right.height, 5);
        expect(left.height).toBeGreaterThan(0.2);
        expect(left.gradient[0]).toBeCloseTo(-right.gradient[0]!, 4);
        expect(left.fiber[0]).toBeCloseTo(-right.fiber[0]!, 5);
        expect(left.fiber[0]!).toBeLessThan(0);
        // Fecha no período: o mesmo ponto uma volta adiante.
        const here = patternKnit([0.37, 0.61], 0, [2, 4], 4, 1.5, 1, 1, 0.3);
        const round = patternKnit([2.37, 4.61], 0, [2, 4], 4, 1.5, 1, 1, 0.3);
        expect(round.height).toBeCloseTo(here.height, 5);
        expect(round.stitch).toBe(here.stitch);
        // Abaixo do pixel: a média, sem gradiente, a fibra ao longo das colunas.
        const far = patternKnit([0.37, 0.61], 1, [0, 0], 4, 1.5, 1, 1, 0.3);
        expect(far.height).toBe(0.35);
        expect(far.strand).toBe(0.5);
        expect(Math.hypot(far.gradient[0]!, far.gradient[1]!)).toBe(0);
        expect(far.fiber[0]).toBeCloseTo(0, 12);
        expect(far.fiber[1]).toBe(1);
    });

    it('trama: a fibra do fio torcido faz o ângulo da torção no meio do fio e corre com o eixo nas bordas', () => {
        const twist = 0.4;
        // Tela, sem vão: o cruzamento (0, 0) é de urdidura (ao longo de p.y); o centro do fio em x = 0,5.
        const middle = patternWeave([0.5, 0.5], 0, [0, 0], 1, 1, 1, 1, 0, 0, twist);
        expect(middle.warp).toBe(1);
        expect(middle.fiber[0]).toBeCloseTo(Math.sin(twist), 12);
        expect(middle.fiber[1]).toBeCloseTo(Math.cos(twist), 12);
        // A 0,35 do passo do meio do fio (seção 1 − 0,49): a hélice vista mais de lado, a fibra mais perto do eixo.
        const side = patternWeave([0.5 + 0.35, 0.5], 0, [0, 0], 1, 1, 1, 1, 0, 0, twist);
        expect(side.warp).toBe(1);
        expect(side.fiber[0]).toBeCloseTo(Math.sin(twist) * Math.sqrt(0.51), 6);
        // Sem torção: a fibra é o eixo do fio e não há cabos.
        const plain = patternWeave([0.5, 0.5], 0, [0, 0], 1, 1, 1, 1, 0, 0);
        expect(plain.fiber).toEqual([0, 1]);
        expect(plain.strand).toBe(1);
        // Os cabos: faixas em [0, 1] que mudam ao longo do fio.
        const along = [0.1, 0.3, 0.5, 0.7, 0.9].map(
            (y) => patternWeave([0.5, y], 0, [0, 0], 1, 4, 1, 2, 0, 0, twist).strand,
        );
        for (const v of along) {
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(1);
        }
        expect(Math.max(...along) - Math.min(...along)).toBeGreaterThan(0.5);
        // A direção em mundo: sobre as tangentes do padrão, normalizada; sem tangentes, zero.
        const world = surfaceDirection([2, 0, 0], [0, 0, 3], middle.fiber);
        expect(Math.hypot(...world)).toBeCloseTo(1, 12);
        expect(world[0]! / world[2]!).toBeCloseTo(
            (2 * Math.sin(twist)) / (3 * Math.cos(twist)),
            12,
        );
        expect(surfaceDirection([0, 0, 0], [0, 0, 0], [1, 1])).toEqual([0, 0, 0]);
    });

    it('limiar: smoothstep do valor com o gradiente pela regra da cadeia; invertido com low > high', () => {
        const base = (p: readonly [number, number]) =>
            patternGrain(p, 0, [0, 0], [1.5, 3], 2, 2, 2, 0.5);
        checkGradient(
            (p) => {
                const g = base(p);
                const t = patternThreshold(g.value, g.gradient, -0.3, 0.4);
                return { h: t.value, g: t.gradient };
            },
            3,
            20,
        );
        expect(patternThreshold(-1, [3, 3], 0, 1)).toEqual({ value: 0, gradient: [0, 0] });
        expect(patternThreshold(2, [3, 3], 0, 1)).toEqual({ value: 1, gradient: [0, 0] });
        expect(patternThreshold(0.5, [1, 0], 0, 1).gradient[0]).toBeCloseTo(1.5, 12);
        // Invertido: 1 abaixo de `high`, 0 acima de `low` (a fresta onde o grão passa de um nível).
        expect(patternThreshold(0.2, [1, 1], 0.5, 0.3).value).toBe(1);
        expect(patternThreshold(0.6, [1, 1], 0.5, 0.3).value).toBe(0);
        expect(patternThreshold(0.4, [1, 0], 0.5, 0.3).gradient[0]).toBeLessThan(0);
    });

    it('relevo em milímetros: a normal é a da superfície deslocada; a altura sai na escala do mundo', () => {
        // Um plano de 2 × 3 unidades por unidade de uv (cena a 10 unidades por metro) com a altura h(u, v) em mm.
        const dpdu = [2, 0, 0];
        const dpdv = [0, 0, -3];
        const n = [0, 1, 0];
        const scale = 10;
        // O padrão em p = uv · (4, 8): valor 0,3, gradiente (0,5; −0,25) por unidade de p; 2 mm por unidade do padrão.
        const relief = surfaceRelief(0.3, [0.5, -0.25], [4, 8], 2, 0.1);
        expect(relief[0]).toBeCloseTo(0.4, 12);
        expect(relief[1]).toBeCloseTo(2 * 0.5 * 4, 12);
        expect(relief[2]).toBeCloseTo(2 * -0.25 * 8, 12);
        expect(surfaceDisplacement(relief, scale)).toBeCloseTo(0.4 * 0.001 * scale, 15);
        // A superfície deslocada: P(u, v) = u·dpdu + v·dpdv + n · H(u, v), H em unidades do mundo; a normal é
        // (∂P/∂u × ∂P/∂v) normalizada, do lado de n.
        const hu = relief[1]! * 0.001 * scale;
        const hv = relief[2]! * 0.001 * scale;
        const pu = [dpdu[0]!, hu, dpdu[2]!];
        const pv = [dpdv[0]!, hv, dpdv[2]!];
        const cross = [
            pu[1]! * pv[2]! - pu[2]! * pv[1]!,
            pu[2]! * pv[0]! - pu[0]! * pv[2]!,
            pu[0]! * pv[1]! - pu[1]! * pv[0]!,
        ];
        const length = Math.hypot(...cross) * Math.sign(cross[1]!);
        const expected = cross.map((c) => c / length);
        const normal = surfaceReliefNormal(n, dpdu, dpdv, relief, scale);
        normal.forEach((c, k) => {
            expect(c).toBeCloseTo(expected[k]!, 12);
        });
        // Sem tangentes (os acertos dos raios): a normal; a inclinação fica presa em 4 (76°).
        expect(surfaceReliefNormal(n, [0, 0, 0], [0, 0, 0], relief, scale)).toEqual(n);
        const steep = surfaceReliefNormal(n, [1, 0, 0], [0, 0, -1], [0, 1e6, 0], 1);
        expect(Math.hypot(steep[0]!, steep[2]!) / steep[1]!).toBeCloseTo(4, 9);
        // Período nulo num eixo (escala degenerada do uvSpace): vale 1.
        expect(surfaceRelief(1, [1, 1], [0, 2], 1, 0)).toEqual([1, 1, 2]);
    });
    it('anéis com nós: o nó soma voltas ao raio em volta dele, com o miolo em [0, 1] e o gradiente da derivada', () => {
        const rings = (p: readonly [number, number], knots: number) =>
            patternRings(p, 0, [0, 0], 4, 0.4, 0.1, [1, 0.5], 3, 0, 0, [3, 12], knots, 0.12, 3);
        let core = 0;
        let moved = 0;
        for (const p of POINTS) {
            const o = rings(p, 1);
            expect(o.knot).toBeGreaterThanOrEqual(0);
            expect(o.knot).toBeLessThanOrEqual(1);
            core = Math.max(core, o.knot);
            if (Math.abs(o.value - rings(p, 0).value) > 1e-3) moved++;
        }
        // Há nós na vizinhança (o miolo de algum passa de 0,9 numa grade fina) e o veio desvia em parte dos pontos —
        // não em todos.
        for (let j = 0; j < 80; j++)
            for (let i = 0; i < 80; i++)
                core = Math.max(core, rings([f32(-4 + 0.1 * i), f32(-4 + 0.1 * j)], 1).knot);
        expect(core).toBeGreaterThan(0.9);
        expect(moved).toBeGreaterThan(3);
        expect(moved).toBeLessThan(POINTS.length);
        expect(rings([0.3, 0.7], 0).knot).toBe(0);
        checkGradient(
            (p) => {
                const o = rings(p, 1);
                return { h: o.value, g: o.gradient };
            },
            1,
            25,
        );
        // Fecha ao longo da fibra.
        const here = patternRings(
            [0.37, 0.61],
            0,
            [2, 0],
            4,
            0.4,
            0.1,
            [1, 0.5],
            3,
            0,
            0,
            [3, 12],
            2,
            0.12,
            3,
        );
        const round = patternRings(
            [2.37, 0.61],
            0,
            [2, 0],
            4,
            0.4,
            0.1,
            [1, 0.5],
            3,
            0,
            0,
            [3, 12],
            2,
            0.12,
            3,
        );
        expect(round.value).toBeCloseTo(here.value, 4);
        expect(round.knot).toBeCloseTo(here.knot, 4);
    });

    it('tijolos: junta em 0 e face em 1, fiadas amarradas a meio tijolo, gradiente = derivada, fecha no período', () => {
        // No meio do tijolo, a face; no meio da junta horizontal, a junta.
        const face = patternBricks([0.5, 0.25], 0, [0, 0], [1, 2], 0.5, 0.1, 0.1, 0);
        expect(face.height).toBe(1);
        expect(face.mortar).toBe(0);
        const joint = patternBricks([0.5, 0.5], 0, [0, 0], [1, 2], 0.5, 0.1, 0.1, 0);
        expect(joint.height).toBe(0);
        expect(joint.mortar).toBe(1);
        // A fiada de cima deslocada meio tijolo: a junta vertical de uma cai no meio do tijolo da outra.
        expect(patternBricks([1, 0.25], 0, [0, 0], [1, 2], 0.5, 0.1, 0.1, 0).mortar).toBe(1);
        expect(patternBricks([1, 0.75], 0, [0, 0], [1, 2], 0.5, 0.1, 0.1, 0).mortar).toBe(0);
        // Em grade (o azulejo), as juntas verticais alinham.
        expect(patternBricks([1, 0.75], 0, [0, 0], [1, 2], 0, 0.1, 0.1, 0).mortar).toBe(1);
        // O tom muda de tijolo para tijolo.
        const tones = new Set(
            POINTS.map((p) => patternBricks(p, 0, [0, 0], [1, 2], 0.5, 0.1, 0.1, 0).brick),
        );
        expect(tones.size).toBeGreaterThan(10);
        checkGradient(
            (p) => {
                const o = patternBricks(p, 0, [0, 0], [1, 2], 0.5, 0.2, 0.3, 1);
                return { h: o.height, g: o.gradient };
            },
            1,
            25,
        );
        const here = patternBricks([0.37, 0.61], 0, [2, 4], [2, 4], 0.5, 0.1, 0.2, 1);
        const round = patternBricks([2.37, 4.61], 0, [2, 4], [2, 4], 0.5, 0.1, 0.2, 1);
        expect(round.height).toBeCloseTo(here.height, 4);
        expect(round.brick).toBe(here.brick);
        // Abaixo do pixel: a média da área, sem gradiente.
        const far = patternBricks([0.37, 0.61], 1, [0, 0], [2, 4], 0.5, 0.1, 0.2, 1);
        expect(Math.hypot(far.gradient[0]!, far.gradient[1]!)).toBe(0);
        expect(far.brick).toBe(0.5);
        expect(far.height + far.mortar).toBeCloseTo(1, 6);
    });

    it('cantaria: blocos de tamanhos variados, junta entre eles, gradiente = derivada, fecha no período', () => {
        // Sem cortes é o tijolo: uma peça por vão, a junta na borda dele.
        expect(
            patternAshlar([0.5, 0.25], 0, [0, 0], [1, 2], 0.5, 0, 0, 0, 0.1, 0.1, 0).height,
        ).toBe(1);
        expect(patternAshlar([0.5, 0.5], 0, [0, 0], [1, 2], 0.5, 0, 0, 0, 0.1, 0.1, 0).mortar).toBe(
            1,
        );
        // Com cortes: mais peças que vãos, de áreas diferentes, a altura em [0, 1].
        const tones = new Map<number, number>();
        for (let i = 0; i < 4000; i++) {
            const p = [(i % 80) / 20 + 0.006, Math.floor(i / 80) / 25 + 0.006];
            const o = patternAshlar(p, 0, [0, 0], [1, 2], 0.5, 3, 0.3, 0, 0.05, 0.1, 2);
            expect(o.height).toBeGreaterThanOrEqual(0);
            expect(o.height).toBeLessThanOrEqual(1);
            if (o.mortar === 0) tones.set(o.block, (tones.get(o.block) ?? 0) + 1);
        }
        expect(tones.size).toBeGreaterThan(24);
        const areas = [...tones.values()];
        expect(Math.max(...areas)).toBeGreaterThan(3 * Math.min(...areas));
        checkGradient(
            (p) => {
                const o = patternAshlar(p, 0, [0, 0], [1, 2], 0.5, 3, 0.2, 0, 0.2, 0.3, 1);
                return { h: o.height, g: o.gradient };
            },
            1,
            25,
        );
        const here = patternAshlar([0.37, 0.61], 0, [2, 4], [2, 4], 0.5, 3, 0.2, 0, 0.1, 0.2, 1);
        const round = patternAshlar([2.37, 4.61], 0, [2, 4], [2, 4], 0.5, 3, 0.2, 0, 0.1, 0.2, 1);
        expect(round.height).toBeCloseTo(here.height, 4);
        expect(round.block).toBe(here.block);
        const far = patternAshlar([0.37, 0.61], 1, [0, 0], [2, 4], 0.5, 3, 0.2, 0, 0.1, 0.2, 1);
        expect(Math.hypot(far.gradient[0]!, far.gradient[1]!)).toBe(0);
        expect(far.block).toBe(0.5);
    });

    it('células: o ponto da célula é o mesmo em toda ela', () => {
        const seen = new Map<number, number[]>();
        for (const p of POINTS) {
            const o = patternCells(p, 0, [0, 0], 3, 0.8, 0.1, 4);
            const first = seen.get(o.cell);
            if (first === undefined) seen.set(o.cell, o.point);
            else {
                expect(o.point[0]).toBeCloseTo(first[0]!, 5);
                expect(o.point[1]).toBeCloseTo(first[1]!, 5);
            }
            expect(Math.hypot(o.point[0]! - p[0]!, o.point[1]! - p[1]!)).toBeLessThan(0.5);
        }
    });

    it('mossas: o fundo no ponto da célula, a altura em [0, 1], gradiente = derivada, fecha no período', () => {
        // Em grade (jitter 0) o ponto fica no centro da célula: fundo 0 ali, 2 · d² fora.
        expect(patternDents([0.5, 0.5], 0, [0, 0], 1, 0, 0).height).toBe(0);
        expect(patternDents([0.75, 0.5], 0, [0, 0], 1, 0, 0).height).toBeCloseTo(0.125, 6);
        for (const p of POINTS) {
            const o = patternDents(p, 0, [0, 0], 2, 0.9, 3);
            expect(o.height).toBeGreaterThanOrEqual(0);
            expect(o.height).toBeLessThanOrEqual(1);
        }
        checkGradient(
            (p) => {
                const o = patternDents(p, 0, [0, 0], 2, 0.9, 3);
                return { h: o.height, g: o.gradient };
            },
            2,
            40,
        );
        const here = patternDents([0.37, 0.61], 0, [2, 4], 4, 1, 1);
        const round = patternDents([2.37, 4.61], 0, [2, 4], 4, 1, 1);
        expect(round.height).toBeCloseTo(here.height, 4);
        expect(round.cell).toBe(here.cell);
        const far = patternDents([0.37, 0.61], 1, [0, 0], 4, 1, 1);
        expect(far.height).toBeCloseTo(0.3, 6);
        expect(Math.hypot(far.gradient[0]!, far.gradient[1]!)).toBe(0);
        expect(far.cell).toBe(0.5);
    });

    it('tábuas: réguas e espinha de peixe — a coordenada da peça corre no comprimento dela, a junta em 0, fecha no período', () => {
        // Réguas: ao longo de x a coordenada da peça anda junto de p.x; cada peça tem o seu deslocamento.
        const a = patternPlanks([0.3, 0.5], 0, [0, 0], 1, 4, 0, 0.05, 0.1, 2);
        const b = patternPlanks([0.3 + 1 / 64, 0.5], 0, [0, 0], 1, 4, 0, 0.05, 0.1, 2);
        expect(b.plank).toBe(a.plank);
        expect(b.p[0]! - a.p[0]!).toBeCloseTo(1 / 64, 6);
        expect(b.p[1]! - a.p[1]!).toBeCloseTo(0, 6);
        expect(a.height).toBe(1);
        expect(a.joint).toBe(0);
        // Na borda da fileira, a junta.
        expect(patternPlanks([0.3, 1], 0, [0, 0], 1, 4, 0, 0.05, 0.1, 2).joint).toBe(1);
        // Espinha de peixe: há peças deitadas (a coordenada anda com p.x) e peças em pé (anda com p.y).
        let flat = 0;
        let upright = 0;
        const tones = new Set<number>();
        for (const p of POINTS) {
            const here = patternPlanks(p, 0, [0, 0], 2, 3, 1, 0.02, 0.05, 5);
            const along = patternPlanks([p[0] + 1 / 1024, p[1]], 0, [0, 0], 2, 3, 1, 0.02, 0.05, 5);
            if (along.plank !== here.plank) continue;
            tones.add(here.plank);
            if (Math.abs(along.p[0]! - here.p[0]! - 1 / 1024) < 1e-5) flat++;
            else if (Math.abs(along.p[1]! - here.p[1]! - 1 / 1024) < 1e-5) upright++;
        }
        expect(flat).toBeGreaterThan(8);
        expect(upright).toBeGreaterThan(8);
        expect(tones.size).toBeGreaterThan(10);
        for (const arrangement of [0, 1]) {
            checkGradient(
                (p) => {
                    const o = patternPlanks(p, 0, [0, 0], 2, 3, arrangement, 0.1, 0.3, 1);
                    return { h: o.height, g: o.gradient };
                },
                1,
                15,
            );
            const here = patternPlanks([0.37, 0.61], 0, [6, 6], 2, 3, arrangement, 0.05, 0.2, 1);
            const round = patternPlanks([6.37, 6.61], 0, [6, 6], 2, 3, arrangement, 0.05, 0.2, 1);
            expect(round.height).toBeCloseTo(here.height, 4);
            expect(round.plank).toBe(here.plank);
            expect(round.p[0]).toBeCloseTo(here.p[0]!, 4);
        }
        const far = patternPlanks([0.37, 0.61], 1, [0, 0], 4, 3, 1, 0.05, 0.2, 1);
        expect(far.height).toBe(1);
        expect(far.joint).toBe(0);
        expect(far.plank).toBe(0.5);
        expect(Math.hypot(far.gradient[0]!, far.gradient[1]!)).toBe(0);
    });
    it('fissuras: placas alongadas no eixo de menor frequência, a fissura da mesma largura em p, gradiente = derivada', () => {
        // Com a mesma frequência nos dois eixos, é o Voronoi das células.
        for (const p of POINTS.slice(0, 20)) {
            const a = patternFissures(p, 0, [0, 0], [2, 2], 0.8, 0.3, 1);
            const b = patternCells(p, 0, [0, 0], 2, 0.8, 0.3, 1);
            expect(a.height).toBeCloseTo(b.height, 6);
            expect(a.plate).toBe(b.cell);
        }
        // Placas compridas ao longo de y: andando em x troca-se de placa mais vezes que andando em y.
        const changes = (dx: number, dy: number): number => {
            let n = 0;
            for (let k = 0; k < 400; k++) {
                const a = patternFissures(
                    [0.01 * k * dx, 0.3 + 0.01 * k * dy],
                    0,
                    [0, 0],
                    [8, 1],
                    1,
                    0.2,
                    2,
                );
                const b = patternFissures(
                    [0.01 * (k + 1) * dx, 0.3 + 0.01 * (k + 1) * dy],
                    0,
                    [0, 0],
                    [8, 1],
                    1,
                    0.2,
                    2,
                );
                if (a.plate !== b.plate) n++;
            }
            return n;
        };
        expect(changes(1, 0)).toBeGreaterThan(2.5 * changes(0, 1));
        // A inclinação da parede da fissura não passa da de uma fissura no eixo fino (a largura é a mesma em p).
        let steepest = 0;
        for (const p of POINTS) {
            const o = patternFissures(p, 0, [0, 0], [8, 1], 1, 0.3, 2);
            expect(o.height).toBeGreaterThanOrEqual(0);
            expect(o.height).toBeLessThanOrEqual(1);
            steepest = Math.max(steepest, Math.hypot(o.gradient[0]!, o.gradient[1]!));
        }
        expect(steepest).toBeLessThanOrEqual((1.5 / 0.3) * 8 + 1e-6);
        checkGradient(
            (p) => {
                const o = patternFissures(p, 0, [0, 0], [4, 1], 0.8, 0.6, 1);
                return { h: o.height, g: o.gradient };
            },
            1,
            25,
        );
        const here = patternFissures([0.37, 0.61], 0, [2, 4], [4, 1], 1, 0.3, 1);
        const round = patternFissures([2.37, 4.61], 0, [2, 4], [4, 1], 1, 0.3, 1);
        expect(round.height).toBeCloseTo(here.height, 4);
        expect(round.plate).toBe(here.plate);
        const far = patternFissures([0.37, 0.61], 1, [0, 0], [8, 2], 1, 0.3, 1);
        expect(far.height).toBeCloseTo(0.7, 6);
        expect(far.plate).toBe(0.5);
    });
    it('fiadas sobrepostas: o dente de serra de cada fiada, o vão com a telha de baixo, o perfil de capa e canal, gradiente = derivada', () => {
        const flat = (p: readonly [number, number], irregularity = 0) =>
            patternShingles(p, 0, [0, 0], [2, 4], 0.5, 0.08, 0.1, 0, irregularity, 3);
        // No meio de uma telha da fiada 1 (x = 0,5: a fiada está deslocada meia telha): a altura cai de perto de 1 (logo acima do pé) a 0,5 (o topo da parte à vista); a posição
        // na fiada vai de 0 a 1.
        const foot = flat([0.5, 0.25 + 0.25 * 0.15]);
        const top = flat([0.5, 0.25 + 0.25 * 0.98]);
        expect(foot.along).toBeCloseTo(0.15, 6);
        expect(foot.height).toBeCloseTo(0.5 * (1 - 0.15 + 1), 6);
        expect(top.height).toBeCloseTo(0.5 * (1 - 0.98 + 1), 6);
        expect(foot.gap).toBe(0);
        // No degrau do pé a altura desce à da telha de baixo (que ali está em 0,5): o salto é meio — uma espessura.
        expect(flat([0.5, 0.25 + 1e-4]).height).toBeLessThan(0.52);
        // No vão lateral aparece a telha de baixo, uma espessura abaixo, com o valor dela.
        const gap = flat([0.25 + 0.001, 0.25 + 0.125]);
        expect(gap.gap).toBe(1);
        expect(gap.height).toBeCloseTo(0.5 * (1 - 0.5), 6);
        expect(gap.tile).not.toBe(flat([0.5, 0.25 + 0.125]).tile);
        // A fiada de cima deslocada meia telha: o vão dela cai no meio da telha desta.
        expect(flat([0.5, 0.5 + 0.125]).gap).toBe(1);
        // O pé recuado ao acaso: com `irregularity` 0,5, a um quarto da fiada ainda se vê a de baixo em parte delas.
        let recessed = 0;
        for (let k = 0; k < 40; k++) recessed += flat([0.5 + 0.5 * k, 0.25 + 0.25 * 0.25], 0.5).gap;
        expect(recessed).toBeGreaterThan(4);
        expect(recessed).toBeLessThan(40);
        // O sentido: com a escala negativa em y, o pé fica do lado de p.y maior.
        const down = patternShingles(
            [0.25, 0.5 - 0.25 * 0.15],
            0,
            [0, 0],
            [2, -4],
            0.5,
            0.08,
            0.1,
            0,
            0,
            3,
        );
        expect(down.along).toBeCloseTo(0.15, 6);
        expect(down.gradient[1]).toBeGreaterThan(0);
        expect(foot.gradient[1]).toBeLessThan(0);
        // O perfil de capa e canal: a capa (o meio da telha) acima do canal (a borda).
        const cap = patternShingles([0.25, 0.375], 0, [0, 0], [2, 4], 0, 0, 0.1, 1, 0, 3);
        const pan = patternShingles([0.5 - 0.01, 0.375], 0, [0, 0], [2, 4], 0, 0, 0.1, 1, 0, 3);
        expect(cap.height).toBeCloseTo(1, 6);
        expect(pan.height).toBeLessThan(0.05);
        for (const [profile, tolerance] of [
            [0, 1],
            [0.7, 1],
        ] as const)
            checkGradient(
                (p) => {
                    const o = patternShingles(p, 0, [0, 0], [2, 4], 0.5, 0.1, 0.3, profile, 0.2, 1);
                    return { h: o.height, g: o.gradient };
                },
                tolerance,
                25,
            );
        // Fecha no período; abaixo do pixel, a média.
        const here = patternShingles([0.37, 0.61], 0, [2, 4], [2, 4], 0.5, 0.1, 0.2, 0.3, 0.2, 1);
        const round = patternShingles([2.37, 4.61], 0, [2, 4], [2, 4], 0.5, 0.1, 0.2, 0.3, 0.2, 1);
        expect(round.height).toBeCloseTo(here.height, 4);
        expect(round.tile).toBe(here.tile);
        const far = patternShingles([0.37, 0.61], 1, [0, 0], [2, 4], 0.5, 0.1, 0.2, 0.3, 0.2, 1);
        expect(far.height).toBe(0.5);
        expect(far.tile).toBe(0.5);
        expect(Math.hypot(far.gradient[0]!, far.gradient[1]!)).toBe(0);
    });
    it('nervuras: a central no meio da lâmina, as secundárias alternadas e inclinadas, as vênulas, gradiente = derivada', () => {
        const at = (p: readonly [number, number], fine = 0, curve = 0) =>
            patternVeins(p, 0, [0, 0], [0.5, 1], 4, 1, curve, 0.05, fine, 2);
        // A nervura central: a crista em y = 0,5 (o meio da lâmina), em todo o comprimento.
        for (const x of [0.1, 0.7, 1.3, 1.9]) {
            const mid = at([x, 0.5]);
            expect(mid.height).toBeCloseTo(1, 6);
            expect(mid.main).toBeCloseTo(1, 6);
            expect(mid.across).toBeCloseTo(0, 6);
        }
        expect(at([0.3, 0.999]).across).toBeCloseTo(0.998, 3);
        // As secundárias: quatro por comprimento (2 unidades de p), inclinadas 45° — a crista em x = 1/4 + k / 2 + |y|;
        // do outro lado da central, deslocadas meio espaço (x = k / 2 + |y|).
        const up = at([0.75 + 0.2, 0.5 + 0.2]);
        expect(up.height).toBeCloseTo(0.7, 4);
        expect(at([0.75 + 0.2 + 0.25, 0.5 + 0.2]).height).toBe(0);
        expect(at([0.5 + 0.2, 0.5 - 0.2]).height).toBeCloseTo(0.7, 4);
        expect(at([0.75 + 0.2, 0.5 - 0.2]).height).toBe(0);
        // A curva leva a nervura para a ponta: a mesma crista fica mais adiante em x.
        expect(at([0.75 + 0.2 + 0.04, 0.5 + 0.2], 0, 1).height).toBeCloseTo(0.7, 4);
        // As vênulas: a rede fina entre as principais, mais baixa (até 0,35), com o valor da aréola.
        let net = 0;
        let highest = 0;
        for (const p of POINTS) {
            const o = at(p, 12);
            expect(o.height).toBeGreaterThanOrEqual(0);
            expect(o.height).toBeLessThanOrEqual(1);
            if (o.main === 0 && o.height > 0) {
                net++;
                highest = Math.max(highest, o.height);
            }
        }
        expect(net).toBeGreaterThan(5);
        expect(highest).toBeLessThanOrEqual(0.35 + 1e-9);
        for (const curve of [0, 1.5])
            checkGradient(
                (p) => {
                    const o = patternVeins(p, 0, [0, 0], [0.5, 1], 4, 1, curve, 0.2, 0, 2);
                    return { h: o.height, g: o.gradient };
                },
                1,
                15,
            );
        // Fecha no período (a lâmina inteira e as vênulas); abaixo do pixel as nervuras somem.
        const here = patternVeins([0.37, 0.61], 0, [2, 1], [0.5, 1], 4, 1, 1, 0.05, 8, 2);
        const round = patternVeins([2.37, 1.61], 0, [2, 1], [0.5, 1], 4, 1, 1, 0.05, 8, 2);
        expect(round.height).toBeCloseTo(here.height, 4);
        expect(round.cell).toBeCloseTo(here.cell, 4);
        const far = patternVeins([0.7, 0.5], 2, [0, 0], [0.5, 1], 4, 1, 1, 0.05, 8, 2);
        expect(far.height).toBe(0);
        expect(far.cell).toBe(0.5);
    });
    it('nervuras: irregulares, afinando para a ponta e com as terciárias em escada', () => {
        const at = (
            p: readonly [number, number],
            irregular: number,
            taper: number,
            ladder: number,
        ) => patternVeins(p, 0, [0, 0], [0.5, 1], 4, 1, 1, 0.05, 0, 2, irregular, taper, ladder);
        // A irregularidade desloca as secundárias: a crista regular deixa de estar onde estava em algum ponto.
        let moved = 0;
        for (let k = 0; k < 40; k++) {
            const y = 0.5 + 0.05 + 0.01 * k;
            const x = 0.75 + (y - 0.5) + (y - 0.5) * (y - 0.5);
            expect(at([x, y], 0, 0, 0).height).toBeCloseTo(0.7, 3);
            if (at([x, y], 0.3, 0, 0).height < 0.6) moved++;
        }
        expect(moved).toBeGreaterThan(10);
        // A central afina para a ponta: a meia largura da base (0,05) cai a 40 % no fim da lâmina com `taper` 0,6.
        expect(at([0.02, 0.5 + 0.03], 0, 0.6, 0).main).toBeGreaterThan(0.1);
        expect(at([1.98, 0.5 + 0.03], 0, 0.6, 0).main).toBe(0);
        // As terciárias: nervuras novas (a 0,5 de altura) no limbo entre as secundárias.
        let rungs = 0;
        for (const p of POINTS) {
            const plain = at(p, 0, 0, 0);
            const stepped = at(p, 0, 0, 8);
            expect(stepped.height).toBeGreaterThanOrEqual(plain.height - 1e-9);
            if (plain.height === 0 && stepped.height > 0) {
                rungs++;
                expect(stepped.height).toBeLessThanOrEqual(0.4 + 1e-9);
            }
        }
        expect(rungs).toBeGreaterThan(3);
        // Fecha no período com tudo ligado.
        const here = patternVeins(
            [0.37, 0.61],
            0,
            [2, 1],
            [0.5, 1],
            4,
            1,
            1,
            0.05,
            8,
            2,
            0.3,
            0.5,
            8,
        );
        const round = patternVeins(
            [2.37, 1.61],
            0,
            [2, 1],
            [0.5, 1],
            4,
            1,
            1,
            0.05,
            8,
            2,
            0.3,
            0.5,
            8,
        );
        expect(round.height).toBeCloseTo(here.height, 4);
    });
    it('aréolas: a almofada redonda entre dois pontos, a borda, o período', () => {
        let walls = 0;
        let tops = 0;
        for (const p of POINTS) {
            const o = patternAreoles(p, 0, [0, 0], 6, 0.8, 0.25, 3);
            expect(o.height).toBeGreaterThanOrEqual(-1e-9);
            expect(o.height).toBeLessThanOrEqual(1);
            expect(o.wall).toBeGreaterThanOrEqual(0);
            expect(o.wall).toBeLessThanOrEqual(1);
            // A borda é onde a almofada é baixa: t ≥ 0,75 ⇔ altura ≤ 1 − 0,75².
            if (o.wall > 0) {
                walls++;
                expect(o.height).toBeLessThanOrEqual(1 - 0.75 * 0.75 + 1e-9);
            }
            if (o.height > 0.8) tops++;
        }
        expect(walls).toBeGreaterThan(3);
        expect(tops).toBeGreaterThan(3);
        // Sem deslocamento, a célula é a grade: no ponto dela a almofada vale 1; a meio caminho do vizinho, 0.
        expect(patternAreoles([0.5, 0.5], 0, [0, 0], 1, 0, 0.25, 1).height).toBeCloseTo(1, 6);
        expect(patternAreoles([1, 0.5], 0, [0, 0], 1, 0, 0.25, 1).height).toBeCloseTo(0, 6);
        // As curvas de nível são círculos: a um quarto do caminho, t = 2 · 0,25 / (0,25 + 0,75) em qualquer direção
        // do eixo — e, na diagonal, o mesmo t a uma distância menor do que a do polígono.
        expect(patternAreoles([0.75, 0.5], 0, [0, 0], 1, 0, 0.25, 1).height).toBeCloseTo(0.75, 6);
        const here = patternAreoles([0.37, 0.61], 0, [2, 1], 6, 0.8, 0.25, 3);
        const round = patternAreoles([2.37, 1.61], 0, [2, 1], 6, 0.8, 0.25, 3);
        expect(round.height).toBeCloseTo(here.height, 4);
        expect(round.cell).toBeCloseTo(here.cell, 4);
        const far = patternAreoles([0.37, 0.61], 2, [0, 0], 6, 0.8, 0.25, 3);
        expect(far.height).toBe(0.5);
        expect(far.wall).toBe(0);
    });
    it('escova: riscos ao longo de x, direção que varia poucos graus, riscos fundos isolados, gradiente = derivada', () => {
        let deepest = 0;
        let gouged = 0;
        let tilt = 0;
        for (const p of POINTS) {
            const o = patternBrush(p, 0, [0, 0], [2, 64], 0.07, [1.5, 3], 0.3, 5);
            expect(Math.hypot(o.direction[0]!, o.direction[1]!)).toBeCloseTo(1, 6);
            // A direção fica a poucos graus de x.
            tilt = Math.max(tilt, Math.abs(o.direction[1]!));
            expect(o.direction[0]).toBeGreaterThan(0.98);
            expect(o.deep).toBeGreaterThanOrEqual(0);
            expect(o.deep).toBeLessThanOrEqual(1);
            if (o.deep > 0) gouged++;
            deepest = Math.min(deepest, o.value);
            // Sem riscos fundos, a altura fica em [-1, 1].
            const fine = patternBrush(p, 0, [0, 0], [2, 64], 0.07, [1.5, 3], 0, 5);
            expect(Math.abs(fine.value)).toBeLessThanOrEqual(1);
            expect(fine.deep).toBe(0);
        }
        expect(tilt).toBeGreaterThan(0.005);
        expect(tilt).toBeLessThan(0.15);
        expect(gouged).toBeGreaterThan(0);
        // Os riscos correm ao longo de x: a altura muda muito mais depressa através (y) do que ao longo.
        let along = 0;
        let across = 0;
        for (const p of POINTS) {
            const g = patternBrush(p, 0, [0, 0], [2, 64], 0.07, [1.5, 3], 0, 5).gradient;
            along += Math.abs(g[0]!);
            across += Math.abs(g[1]!);
        }
        expect(across).toBeGreaterThan(5 * along);
        checkGradient(
            (p) => {
                const o = patternBrush(p, 0, [0, 0], [1, 8], 0.07, [1.5, 3], 0, 5);
                return { h: o.value, g: o.gradient };
            },
            1,
            15,
        );
        // Fecha no período; abaixo do pixel os riscos vão à média.
        const here = patternBrush([0.37, 0.61], 0, [2, 1], [2, 64], 0.07, [1.5, 3], 0.3, 5);
        const round = patternBrush([2.37, 1.61], 0, [2, 1], [2, 64], 0.07, [1.5, 3], 0.3, 5);
        expect(round.value).toBeCloseTo(here.value, 3);
        const far = patternBrush([0.37, 0.61], 1, [0, 0], [2, 64], 0.07, [1.5, 3], 0.3, 5);
        expect(far.value).toBe(0);
    });
    it('brilhos pontuais: a célula do pixel em dois níveis, contínua na troca de nível, fixa no objeto', () => {
        // Sem a largura do pixel, ou com os flocos resolvidos (mais de 5 pixels por floco): sem sorteio.
        expect(patternGlints([0.3, 0.7], 0, 64, 1).count).toBe(0);
        expect(patternGlints([0.3, 0.7], 0.15 / 64, 64, 1).count).toBe(0);
        // Um pixel de 6 flocos de lado: o nível 3 (células de 8 flocos de lado, 64 flocos) e o seguinte, de 256.
        const a = patternGlints([0.3, 0.7], 6 / 64, 64, 1);
        expect(a.count).toBe(64);
        expect(a.cells[2]).toBeCloseTo(Math.log2(6) + 0.5 - 3, 6);
        // A célula é fixa em p: o mesmo valor em toda a célula do primeiro nível, outro na vizinha.
        const same = patternGlints([0.3 + 0.01, 0.7 + 0.01], 6 / 64, 64, 1);
        expect(same.cells[0]).toBe(a.cells[0]);
        expect(patternGlints([0.3 + 0.125, 0.7], 6 / 64, 64, 1).cells[0]).not.toBe(a.cells[0]);
        // A troca de nível é contínua: o segundo nível logo antes de uma potência de 2 é o primeiro logo depois.
        const before = patternGlints([0.3, 0.7], (2 ** 2.5 - 1e-3) / 64, 64, 1);
        const after = patternGlints([0.3, 0.7], (2 ** 2.5 + 1e-3) / 64, 64, 1);
        expect(before.cells[2]).toBeGreaterThan(0.99);
        expect(after.cells[2]).toBeLessThan(0.01);
        expect(after.cells[0]).toBe(before.cells[1]);
        expect(after.count).toBe(4 * before.count);
        // Os valores das células cobrem [0, 1].
        let low = 1;
        let high = 0;
        for (const p of POINTS) {
            const c = patternGlints(p, 2 / 64, 64, 4).cells[0]!;
            low = Math.min(low, c);
            high = Math.max(high, c);
        }
        expect(low).toBeLessThan(0.1);
        expect(high).toBeGreaterThan(0.9);
    });
    it('brilhos pontuais: a contagem dos flocos alinhados tem a média e a variância da binomial', () => {
        // Sorteios igualmente espaçados em [0, 1): a média da contagem é N · p (a energia do lobo) e a variância, a da
        // Poisson (poucos alinhados) ou da binomial (muitos).
        const moments = (count: number, p: number): [number, number] => {
            const n = 20000;
            let sum = 0;
            let squares = 0;
            for (let k = 0; k < n; k++) {
                const c = glintCount(count, p, (k + 0.5) / n);
                sum += c;
                squares += c * c;
            }
            const mean = sum / n;
            return [mean, squares / n - mean * mean];
        };
        for (const [count, p] of [
            [16, 0.002],
            [64, 0.01],
            [64, 0.06],
            [256, 0.05],
            [4096, 0.02],
        ] as const) {
            const [mean, variance] = moments(count, p);
            expect(mean / (count * p)).toBeCloseTo(1, 1);
            const expected = count * p >= 8 ? count * p * (1 - p) : count * p;
            expect(variance / expected).toBeGreaterThan(0.85);
            expect(variance / expected).toBeLessThan(1.15);
        }
        // Poucos flocos e pouca chance: quase sempre nenhum, às vezes um — os pontos ralos longe do realce.
        expect(glintCount(16, 0.002, 0.5)).toBe(0);
        expect(glintCount(16, 0.002, 0.99)).toBe(1);
        // A contagem nunca passa do número de flocos.
        expect(glintCount(4, 0.9, 0.999999)).toBeLessThanOrEqual(4);
    });
});
