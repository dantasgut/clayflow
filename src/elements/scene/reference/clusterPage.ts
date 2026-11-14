// Referência em f64 do teste aglomerado × página do mapa de sombra virtual (spec 034, T064; só para testes): a regra de
// `sp_shape_touches` em `shadow_pages.wgsl`. A caixa de um aglomerado (espaço do objeto) vista da luz é a soma de três
// segmentos no plano da luz (os meios eixos da caixa pela matriz mundo → luz) em volta do centro: um polígono convexo.
// Ela toca o retângulo da página se nenhum eixo os separa — os do retângulo e as normais dos três segmentos (dois
// convexos no plano se separam por uma das normais das arestas de um deles).

/** Vetor no plano. */
export type V2 = readonly [number, number];
/** Ponto 3D. */
export type V3 = readonly [number, number, number];
/** Linha de uma matriz afim: os coeficientes de x, y, z e a translação. */
export type Row = readonly [number, number, number, number];
/** Matriz 3 × 4 (linhas): a parte afim de mundo → luz composta com objeto → mundo. */
export type Affine = readonly [Row, Row, Row];

/** A forma da caixa no plano da luz: o centro e os três meios eixos. */
export interface ClusterShape {
    readonly center: V2;
    readonly axes: readonly [V2, V2, V2];
}

const dot = (a: V2, b: V2): number => a[0] * b[0] + a[1] * b[1];

/** A linha `row` aplicada ao ponto `p`. */
const apply = (row: Row, p: V3): number => row[0] * p[0] + row[1] * p[1] + row[2] * p[2] + row[3];

/** A forma da caixa (`lo`, `hi`) pela transformação afim `m` (só as linhas x e y do plano da luz importam). */
export function clusterShape(m: Affine, lo: V3, hi: V3): ClusterShape {
    const c: V3 = [0.5 * (lo[0] + hi[0]), 0.5 * (lo[1] + hi[1]), 0.5 * (lo[2] + hi[2])];
    const h: V3 = [0.5 * (hi[0] - lo[0]), 0.5 * (hi[1] - lo[1]), 0.5 * (hi[2] - lo[2])];
    const [x, y] = m;
    return {
        center: [apply(x, c), apply(y, c)],
        axes: [
            [x[0] * h[0], y[0] * h[0]],
            [x[1] * h[1], y[1] * h[1]],
            [x[2] * h[2], y[2] * h[2]],
        ],
    };
}

/** A forma toca o retângulo (x0, y0, x1, y1)? */
export function shapeTouches(
    s: ClusterShape,
    rect: readonly [number, number, number, number],
): boolean {
    const half: V2 = [0.5 * (rect[2] - rect[0]), 0.5 * (rect[3] - rect[1])];
    const d: V2 = [
        s.center[0] - 0.5 * (rect[0] + rect[2]),
        s.center[1] - 0.5 * (rect[1] + rect[3]),
    ];
    const normals: V2[] = [[1, 0], [0, 1], ...s.axes.map((a): V2 => [-a[1], a[0]])];
    for (const n of normals) {
        const reach = s.axes.reduce((acc, a) => acc + Math.abs(dot(n, a)), 0);
        if (Math.abs(dot(n, d)) > reach + Math.abs(n[0]) * half[0] + Math.abs(n[1]) * half[1])
            return false;
    }
    return true;
}

/** Os oito cantos da caixa no plano da luz (para conferir a forma contra a projeção direta). */
export function projectedCorners(m: Affine, lo: V3, hi: V3): V2[] {
    const out: V2[] = [];
    for (let k = 0; k < 8; k++) {
        const p: V3 = [k & 1 ? hi[0] : lo[0], k & 2 ? hi[1] : lo[1], k & 4 ? hi[2] : lo[2]];
        out.push([apply(m[0], p), apply(m[1], p)]);
    }
    return out;
}
