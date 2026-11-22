import { describe, expect, it } from 'vitest';
import {
    patternCells,
    patternGrain,
    patternKnit,
    patternRings,
    patternThreshold,
    patternWeave,
} from '../reference/pattern';
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
});
