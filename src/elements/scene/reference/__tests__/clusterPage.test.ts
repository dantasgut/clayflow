/**
 * O teste aglomerado × página do mapa de sombra virtual (spec 034, T064): a referência de `sp_shape_touches` — a forma
 * da caixa vista da luz (centro e três meios eixos) toca o retângulo da página exatamente quando o polígono dos cantos
 * projetados o toca; nunca perde uma página que um canto alcança; e o aglomerado fino e oblíquo à luz não toca a página
 * que só a caixa alinhada aos eixos da luz tocaria (o que tornava o desenho da malha grande caro).
 */
import { describe, expect, it } from 'vitest';
import {
    clusterShape,
    projectedCorners,
    shapeTouches,
    type Affine,
    type V2,
    type V3,
} from '../clusterPage';

/** Gerador determinístico (mulberry32). */
function rng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Envoltória convexa (cadeia monótona), no sentido anti-horário. */
function hull(points: readonly V2[]): V2[] {
    const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o: V2, a: V2, b: V2): number =>
        (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower: V2[] = [];
    for (const q of p) {
        while (
            lower.length >= 2
            && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, q) <= 0
        )
            lower.pop();
        lower.push(q);
    }
    const upper: V2[] = [];
    for (const q of [...p].reverse()) {
        while (
            upper.length >= 2
            && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, q) <= 0
        )
            upper.pop();
        upper.push(q);
    }
    return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Distância com sinal do polígono convexo ao retângulo pelo recorte (Sutherland–Hodgman): sobra algo? */
function clipTouches(
    poly: readonly V2[],
    rect: readonly [number, number, number, number],
): boolean {
    const planes: [(q: V2) => number, (a: V2, b: V2) => V2][] = [
        [(q) => q[0] - rect[0], (a, b) => lerp(a, b, (rect[0] - a[0]) / (b[0] - a[0]))],
        [(q) => rect[2] - q[0], (a, b) => lerp(a, b, (rect[2] - a[0]) / (b[0] - a[0]))],
        [(q) => q[1] - rect[1], (a, b) => lerp(a, b, (rect[1] - a[1]) / (b[1] - a[1]))],
        [(q) => rect[3] - q[1], (a, b) => lerp(a, b, (rect[3] - a[1]) / (b[1] - a[1]))],
    ];
    let out = [...poly];
    for (const [inside, cut] of planes) {
        const next: V2[] = [];
        out.forEach((a, i) => {
            const b = out[(i + 1) % out.length]!;
            const ia = inside(a) >= 0;
            const ib = inside(b) >= 0;
            if (ia) next.push(a);
            if (ia !== ib) next.push(cut(a, b));
        });
        out = next;
        if (out.length === 0) return false;
    }
    return true;
}

function lerp(a: V2, b: V2, t: number): V2 {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Rotação pelos ângulos (x, y, z) com escala e translação, nas linhas x e y do plano da luz. */
function affine(r: () => number): Affine {
    const [a, b, c] = [r() * 6.3, r() * 6.3, r() * 6.3];
    const [ca, sa, cb, sb, cc, sc] = [
        Math.cos(a),
        Math.sin(a),
        Math.cos(b),
        Math.sin(b),
        Math.cos(c),
        Math.sin(c),
    ];
    const s = 0.5 + r() * 2;
    const t = (): number => (r() - 0.5) * 4;
    return [
        [cb * cc * s, (sa * sb * cc - ca * sc) * s, (ca * sb * cc + sa * sc) * s, t()],
        [cb * sc * s, (sa * sb * sc + ca * cc) * s, (ca * sb * sc - sa * cc) * s, t()],
        [-sb * s, sa * cb * s, ca * cb * s, t()],
    ];
}

describe('o teste aglomerado × página (sp_shape_touches)', () => {
    it('toca exatamente quando o polígono dos cantos projetados toca a página', () => {
        // Arrange
        const r = rng(2026);
        let agree = 0;
        let cases = 0;
        // Act
        for (let n = 0; n < 4000; n++) {
            const m = affine(r);
            const lo: V3 = [(r() - 0.5) * 2, (r() - 0.5) * 2, (r() - 0.5) * 2];
            const hi: V3 = [lo[0] + r() * 1.5, lo[1] + r() * 0.05, lo[2] + r() * 1.5];
            const x = (r() - 0.5) * 6;
            const y = (r() - 0.5) * 6;
            const side = 0.05 + r() * 1.5;
            const rect = [x, y, x + side, y + side] as const;
            const expected = clipTouches(hull(projectedCorners(m, lo, hi)), rect);
            const got = shapeTouches(clusterShape(m, lo, hi), rect);
            cases++;
            if (got === expected) agree++;
        }
        // Assert: só os casos de toque na aresta (medida zero) podem divergir.
        expect(agree / cases).toBeGreaterThan(0.999);
    });

    it('nunca perde uma página que um canto projetado alcança', () => {
        // Arrange
        const r = rng(7);
        let missed = 0;
        // Act
        for (let n = 0; n < 2000; n++) {
            const m = affine(r);
            const lo: V3 = [r() - 0.5, r() - 0.5, r() - 0.5];
            const hi: V3 = [lo[0] + r(), lo[1] + r(), lo[2] + r()];
            const shape = clusterShape(m, lo, hi);
            for (const q of projectedCorners(m, lo, hi)) {
                const rect = [q[0] - 1e-3, q[1] - 1e-3, q[0] + 1e-3, q[1] + 1e-3] as const;
                if (!shapeTouches(shape, rect)) missed++;
            }
        }
        // Assert
        expect(missed).toBe(0);
    });

    it('o aglomerado fino e oblíquo não toca a página que só a caixa alinhada à luz tocaria', () => {
        // Arrange: uma fileira de 0,72 m × 1 cm girada 45° no plano da luz; a página no canto da caixa alinhada.
        const c = Math.SQRT1_2;
        const m: Affine = [
            [c, 0, -c, 0],
            [c, 0, c, 0],
            [0, 1, 0, 0],
        ];
        const lo: V3 = [0, 0, 0];
        const hi: V3 = [0.72, 0.01, 0.01];
        const corners = projectedCorners(m, lo, hi);
        const xs = corners.map((q) => q[0]);
        const ys = corners.map((q) => q[1]);
        const page = [
            Math.min(...xs),
            Math.max(...ys) - 0.05,
            Math.min(...xs) + 0.05,
            Math.max(...ys),
        ] as const;
        // Act
        const touches = shapeTouches(clusterShape(m, lo, hi), page);
        const aligned =
            Math.min(...xs) <= page[2] && page[0] <= Math.max(...xs) && Math.min(...ys) <= page[3];
        // Assert
        expect(aligned).toBe(true);
        expect(touches).toBe(false);
    });
});
