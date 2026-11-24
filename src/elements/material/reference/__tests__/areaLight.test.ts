import { describe, expect, it } from 'vitest';
import { areaExact, areaIsWide, areaLobe, areaWide, type AreaRect } from '../areaLight';
import { dGgxAniso, vSmithCorrelatedAniso, type Vec3 } from '../bsdf';

// A quadratura da luz de área retangular (spec 011, R19) contra a regra do ponto médio densa.

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: Vec3): Vec3 => {
    const l = Math.hypot(a[0], a[1], a[2]);
    return [a[0] / l, a[1] / l, a[2] / l];
};

const N: Vec3 = [0, 1, 0];
const T: Vec3 = [1, 0, 0];
const B: Vec3 = [0, 0, -1];

/** O lobo GGX (sem Fresnel) vezes o cosseno, na superfície de normal +y e tangente +x. */
function lobe(v: Vec3, at: number, ab: number): (l: Vec3) => number {
    return (l) => {
        const nl = dot(N, l);
        const nv = dot(N, v);
        if (nl <= 0 || nv <= 0) return 0;
        const h = unit([v[0] + l[0], v[1] + l[1], v[2] + l[2]]);
        return (
            dGgxAniso(dot(T, h), dot(B, h), dot(N, h), at, ab)
            * vSmithCorrelatedAniso(at, ab, dot(T, v), dot(B, v), dot(T, l), dot(B, l), nv, nl)
            * nl
        );
    };
}

/** Um painel horizontal de meias medidas `half`, virado para baixo, com o centro em `center`. */
function panel(center: Vec3, half: readonly [number, number]): AreaRect {
    return { center, ax: [1, 0, 0], ay: [0, 0, 1], normal: [0, -1, 0], half };
}

describe('luz de área — quadratura', () => {
    it('lobo especular: perto da integral densa, do espelho ao lobo largo, isotrópico e anisotrópico', () => {
        // A integral densa só na janela em volta do ponto do espelho (o lobo estreito cabe em poucos pedaços).
        const dense = (
            c: Vec3,
            half: readonly [number, number],
            at: readonly [number, number],
            win: number,
            f: (l: Vec3) => number,
        ): number => {
            const x0 = Math.max(c[0] - half[0], at[0] - win);
            const x1 = Math.min(c[0] + half[0], at[0] + win);
            const z0 = Math.max(c[2] - half[1], at[1] - win);
            const z1 = Math.min(c[2] + half[1], at[1] + win);
            if (x1 <= x0 || z1 <= z0) return 0;
            const part = panel(
                [(x0 + x1) / 2, c[1], (z0 + z1) / 2],
                [(x1 - x0) / 2, (z1 - z0) / 2],
            );
            return areaExact(part, [0, 0, 0], f, 320);
        };
        let worst = 0;
        const used = [0, 0];
        for (const [at, ab] of [
            [0.0025, 0.0025],
            [0.02, 0.02],
            [0.09, 0.09],
            [0.25, 0.25],
            [0.05, 0.2],
            [0.2, 0.05],
        ] as const) {
            for (const tilt of [0, 0.5, 1]) {
                const v = unit([Math.sin(tilt), Math.cos(tilt), 0.2]);
                const f = lobe(v, at, ab);
                // O ponto do plano do painel na direção refletida; o painel deslocado `shift` meias larguras dele.
                const mirror = [(-v[0] / v[1]) * 2, (-v[2] / v[1]) * 2] as const;
                const win = Math.max(at, ab) * 400;
                const full = dense([mirror[0], 2, mirror[1]], [60, 60], mirror, win, f);
                for (const shift of [0, 0.6, 1, 1.3]) {
                    const c: Vec3 = [mirror[0] + shift * 0.8, 2, mirror[1]];
                    const exact = dense(c, [0.8, 0.5], mirror, win, f);
                    // O caminho que a GPU toma: os pontos de Gauss quando o lobo é largo diante do painel.
                    const rect = panel(c, [0.8, 0.5]);
                    const wide = areaIsWide(rect, [0, 0, 0], at, ab);
                    used[wide ? 1 : 0]! += 1;
                    const got = wide
                        ? areaWide(rect, [0, 0, 0], f)
                        : areaLobe(rect, [0, 0, 0], v, N, T, at, ab, f);
                    worst = Math.max(worst, Math.abs(got - exact) / full);
                }
            }
        }
        // O erro como fração da energia do lobo inteiro (a mancha cheia): medido, 3,0 %.
        expect(worst).toBeLessThan(0.04);
        // Os dois caminhos são exercitados.
        expect(used[0]!).toBeGreaterThan(10);
        expect(used[1]!).toBeGreaterThan(5);
    });

    it('lobo especular: contínuo quando o painel desliza (sem degraus)', () => {
        const v = unit([0.4, 1, 0]);
        const f = lobe(v, 0.06, 0.06);
        let last = -1;
        let jump = 0;
        let peak = 0;
        for (let k = 0; k <= 400; k++) {
            const rect = panel([-0.8 - 1.5 + (3 * k) / 400, 2, 0], [0.6, 0.6]);
            const got = areaLobe(rect, [0, 0, 0], v, N, T, 0.06, 0.06, f);
            if (last >= 0) jump = Math.max(jump, Math.abs(got - last));
            peak = Math.max(peak, got);
            last = got;
        }
        expect(peak).toBeGreaterThan(0.5);
        expect(jump / peak).toBeLessThan(0.04);
    });

    it('lobo largo: o difuso de um painel por Gauss-Legendre fecha com a integral densa', () => {
        for (const c of [
            [0, 2, 0],
            [1.5, 1, 0.5],
            [3, 0.6, 0],
        ] as const) {
            const rect = panel(c, [0.8, 0.5]);
            const f = (l: Vec3): number => Math.max(dot(N, l), 0) / Math.PI;
            const exact = areaExact(rect, [0, 0, 0], f, 400);
            expect(areaWide(rect, [0, 0, 0], f) / exact).toBeCloseTo(1, 2);
        }
    });

    it('nada do lado de trás do painel', () => {
        const rect = panel([0, -1, 0], [1, 1]);
        const v = unit([0.2, 1, 0]);
        expect(areaLobe(rect, [0, 0, 0], v, N, T, 0.1, 0.1, lobe(v, 0.1, 0.1))).toBe(0);
        expect(areaWide(rect, [0, 0, 0], () => 1)).toBe(0);
    });
});
