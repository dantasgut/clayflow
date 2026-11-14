// Referência da CPU dos nós de padrão (spec 038): a posição `p·scale + offset` arredondada ao f32 como na GPU (as
// amostras usam escalas potências de 2: o produto é exato em f32, com ou sem FMA), a onda quadrada e a média dela sobre
// a largura em f64. Tolerância (`|gpu − ref| ≤ tol · max(1, |ref|)`) 1e-4: a diferença das larguras em f32 dividida pela
// largura (≥ 0,02 célula nas amostras com filtro); sem filtro, exato.
import { num, uniform, vec, vector, type NodeCase, type NodeValues } from './cases';

const f32 = Math.fround;
const fract = (x: number): number => x - Math.floor(x);

/** `node_pattern_square` num eixo: a onda quadrada (±1, período 2) média sobre [q − w/2, q + w/2]. */
export function patternSquare(q: number, w: number): number {
    if (w < 1e-4) return fract(q * 0.5) < 0.5 ? 1 : -1;
    const tri = (x: number): number => Math.abs(fract(x * 0.5) - 0.5);
    return (2 * (tri(q - 0.5 * w) - tri(q + 0.5 * w))) / w;
}

/** `pattern.checker2`: o xadrez 2D em [0, 1] (0 nas casas pares), filtrado pela largura. */
export function patternChecker2(
    p: readonly number[],
    width: number,
    scale: number,
    offset: readonly number[],
): number {
    const w = Math.max(width, 0) * Math.abs(scale);
    const s = [0, 1].map((k) => patternSquare(f32(p[k]! * scale + offset[k]!), w));
    return 0.5 - 0.5 * s[0]! * s[1]!;
}

/** `pattern.checker3`: o xadrez 3D (sólido) em [0, 1], filtrado pela largura. */
export function patternChecker3(
    p: readonly number[],
    width: number,
    scale: number,
    offset: readonly number[],
): number {
    const w = Math.max(width, 0) * Math.abs(scale);
    const s = [0, 1, 2].map((k) => patternSquare(f32(p[k]! * scale + offset[k]!), w));
    return 0.5 - 0.5 * s[0]! * s[1]! * s[2]!;
}

/** Amostra: `p` em [-4, 4], escala potência de 2, deslocamento, e a largura (um terço sem filtro). */
function sample(random: () => number, k: number, n: number): NodeValues {
    const scale = [1, 2, 4, 8][k % 4]!;
    return {
        p: vector(random, n, -4, 4),
        width: k % 3 === 0 ? 0 : uniform(random, 0.02, 0.6) / scale,
        scale,
        offset: vector(random, n, -1, 1),
    };
}

export const patternCases: readonly NodeCase[] = [
    {
        node: 'pattern.checker2',
        tolerance: 1e-4,
        sample: (r, k) => sample(r, k, 2),
        reference: (x) => ({
            value: patternChecker2(vec(x.p), num(x.width), num(x.scale), vec(x.offset)),
        }),
    },
    {
        node: 'pattern.checker3',
        tolerance: 1e-4,
        sample: (r, k) => sample(r, k, 3),
        reference: (x) => ({
            value: patternChecker3(vec(x.p), num(x.width), num(x.scale), vec(x.offset)),
        }),
    },
];
