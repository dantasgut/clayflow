// Referência da CPU dos nós de matemática (spec 031, R12): a mesma regra do WGSL em f64. Tolerâncias (por componente,
// `|gpu − ref| ≤ tol · max(1, |ref|)`): aritmética, constantes, separar/combinar, mínimo, máximo, `abs`, `floor`,
// `fract`, `mix`, `clamp`, `sqrt`, conversões u32 ↔ f32 1e-6 (arredondamento do f32; divisão e `sqrt` ≤ 2,5 ULP no WGSL); `smoothstep` e os
// produtos/normas de vetores 1e-5; `pow` 1e-4 (herdada de `exp2(e·log2(x))`); `sin`/`cos` 5e-4 (o WGSL garante 2⁻¹¹
// absoluto em [−π, π]); `atan2` 5e-4 (4096 ULP); `tan` 4e-3 (herdada de `sin/cos` com |x| ≤ 1,2).
import { num, uniform, vec, vector, type NodeCase, type NodeValues } from './cases';

type V = readonly number[];

const map = (v: V, f: (x: number, k: number) => number): number[] => v.map(f);
const zip = (a: V, b: V, f: (x: number, y: number) => number): number[] =>
    a.map((x, k) => f(x, b[k]!));
const dot = (a: V, b: V): number => a.reduce((s, x, k) => s + x * b[k]!, 0);
const len = (v: V): number => Math.sqrt(dot(v, v));
const lerp = (a: number, b: number, t: number): number => a * (1 - t) + b * t;
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const nonZero = (random: () => number): number =>
    (random() < 0.5 ? -1 : 1) * uniform(random, 0.25, 4);
/** Vetor com comprimento em [0,5; 2] (normalizar e dividir longe de zero). */
const direction = (random: () => number): number[] => {
    const v = vector(random, 3, -1, 1);
    const l = Math.max(len(v), 1e-3);
    const s = uniform(random, 0.5, 2) / l;
    return map(v, (x) => x * s);
};

/** `smoothstep` do WGSL. */
export function smoothstep(e0: number, e1: number, x: number): number {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
}

/** Caso de um nó escalar ou vetorial de saída `value`. */
function unary(
    node: string,
    tolerance: number,
    sample: (random: () => number) => NodeValues,
    f: (x: NodeValues) => number | number[],
): NodeCase {
    return { node, tolerance, sample, reference: (x) => ({ value: f(x) }) };
}

const ab = (random: () => number): NodeValues => ({
    a: uniform(random, -4, 4),
    b: uniform(random, -4, 4),
});
const ab3 = (random: () => number): NodeValues => ({
    a: vector(random, 3, -4, 4),
    b: vector(random, 3, -4, 4),
});
const x4 = (random: () => number): NodeValues => ({ x: uniform(random, -4, 4) });

/** Casos dos nós `math.*`. */
export const mathCases: readonly NodeCase[] = [
    unary(
        'math.value',
        1e-6,
        (r) => ({ value: uniform(r, -8, 8) }),
        (x) => num(x.value),
    ),
    unary(
        'math.value2',
        1e-6,
        (r) => ({ value: vector(r, 2, -8, 8) }),
        (x) => [...vec(x.value)],
    ),
    unary(
        'math.value3',
        1e-6,
        (r) => ({ value: vector(r, 3, -8, 8) }),
        (x) => [...vec(x.value)],
    ),
    unary(
        'math.value4',
        1e-6,
        (r) => ({ value: vector(r, 4, -8, 8) }),
        (x) => [...vec(x.value)],
    ),
    unary('math.add', 1e-6, ab, (x) => num(x.a) + num(x.b)),
    unary('math.sub', 1e-6, ab, (x) => num(x.a) - num(x.b)),
    unary('math.mul', 1e-6, ab, (x) => num(x.a) * num(x.b)),
    unary(
        'math.div',
        1e-6,
        (r) => ({ a: uniform(r, -4, 4), b: nonZero(r) }),
        (x) => num(x.a) / num(x.b),
    ),
    unary('math.min', 1e-6, ab, (x) => Math.min(num(x.a), num(x.b))),
    unary('math.max', 1e-6, ab, (x) => Math.max(num(x.a), num(x.b))),
    unary('math.abs', 1e-6, x4, (x) => Math.abs(num(x.x))),
    unary('math.floor', 1e-6, x4, (x) => Math.floor(num(x.x))),
    unary('math.fract', 1e-6, x4, (x) => num(x.x) - Math.floor(num(x.x))),
    unary(
        'math.mix',
        1e-6,
        (r) => ({ a: uniform(r, -4, 4), b: uniform(r, -4, 4), t: uniform(r, -0.5, 1.5) }),
        (x) => lerp(num(x.a), num(x.b), num(x.t)),
    ),
    unary(
        'math.clamp',
        1e-6,
        (r) => {
            const low = uniform(r, -2, 1);
            return { x: uniform(r, -4, 4), low, high: low + uniform(r, 0, 3) };
        },
        (x) => clamp(num(x.x), num(x.low), num(x.high)),
    ),
    unary(
        'math.smoothstep',
        1e-5,
        (r) => {
            const edge0 = uniform(r, -2, 1);
            return { edge0, edge1: edge0 + uniform(r, 0.25, 3), x: uniform(r, -3, 4) };
        },
        (x) => smoothstep(num(x.edge0), num(x.edge1), num(x.x)),
    ),
    unary(
        'math.pow',
        1e-4,
        (r) => ({ x: uniform(r, 0.1, 4), e: uniform(r, -2, 3) }),
        (x) => num(x.x) ** num(x.e),
    ),
    unary(
        'math.sqrt',
        1e-6,
        (r) => ({ x: uniform(r, 0, 16) }),
        (x) => Math.sqrt(num(x.x)),
    ),
    unary(
        'math.sin',
        5e-4,
        (r) => ({ x: uniform(r, -Math.PI, Math.PI) }),
        (x) => Math.sin(num(x.x)),
    ),
    unary(
        'math.cos',
        5e-4,
        (r) => ({ x: uniform(r, -Math.PI, Math.PI) }),
        (x) => Math.cos(num(x.x)),
    ),
    unary(
        'math.tan',
        4e-3,
        (r) => ({ x: uniform(r, -1.2, 1.2) }),
        (x) => Math.tan(num(x.x)),
    ),
    unary(
        'math.atan2',
        5e-4,
        (r) => ({ y: uniform(r, -2, 2), x: nonZero(r) }),
        (x) => Math.atan2(num(x.y), num(x.x)),
    ),
    unary('math.add3', 1e-6, ab3, (x) => zip(vec(x.a), vec(x.b), (p, q) => p + q)),
    unary('math.sub3', 1e-6, ab3, (x) => zip(vec(x.a), vec(x.b), (p, q) => p - q)),
    unary('math.mul3', 1e-6, ab3, (x) => zip(vec(x.a), vec(x.b), (p, q) => p * q)),
    unary(
        'math.div3',
        1e-6,
        (r) => ({ a: vector(r, 3, -4, 4), b: [nonZero(r), nonZero(r), nonZero(r)] }),
        (x) => zip(vec(x.a), vec(x.b), (p, q) => p / q),
    ),
    unary(
        'math.scale3',
        1e-6,
        (r) => ({ v: vector(r, 3, -4, 4), s: uniform(r, -4, 4) }),
        (x) => map(vec(x.v), (p) => p * num(x.s)),
    ),
    unary(
        'math.mix3',
        1e-6,
        (r) => ({ a: vector(r, 3, -4, 4), b: vector(r, 3, -4, 4), t: uniform(r, -0.5, 1.5) }),
        (x) => zip(vec(x.a), vec(x.b), (p, q) => lerp(p, q, num(x.t))),
    ),
    unary('math.dot', 1e-5, ab3, (x) => dot(vec(x.a), vec(x.b))),
    unary('math.cross', 1e-5, ab3, (x) => {
        const [a0, a1, a2] = vec(x.a) as [number, number, number];
        const [b0, b1, b2] = vec(x.b) as [number, number, number];
        return [a1 * b2 - a2 * b1, a2 * b0 - a0 * b2, a0 * b1 - a1 * b0];
    }),
    unary(
        'math.normalize',
        1e-5,
        (r) => ({ v: direction(r) }),
        (x) => map(vec(x.v), (p) => p / len(vec(x.v))),
    ),
    unary(
        'math.length',
        1e-5,
        (r) => ({ v: vector(r, 3, -4, 4) }),
        (x) => len(vec(x.v)),
    ),
    unary('math.distance', 1e-5, ab3, (x) => len(zip(vec(x.a), vec(x.b), (p, q) => p - q))),
    unary(
        'math.toFloat',
        1e-6,
        (r) => ({ x: Math.floor(uniform(r, 0, 1 << 20)) }),
        (x) => num(x.x),
    ),
    unary(
        'math.toUint',
        1e-6,
        (r) => ({ x: uniform(r, -4, 1000) }),
        (x) => Math.trunc(Math.max(num(x.x), 0)),
    ),
    {
        node: 'math.split2',
        tolerance: 1e-6,
        sample: (r) => ({ v: vector(r, 2, -8, 8) }),
        reference: (x) => ({ x: vec(x.v)[0]!, y: vec(x.v)[1]! }),
    },
    unary(
        'math.combine2',
        1e-6,
        (r) => ({ x: uniform(r, -8, 8), y: uniform(r, -8, 8) }),
        (x) => [num(x.x), num(x.y)],
    ),
    {
        node: 'math.split3',
        tolerance: 1e-6,
        sample: (r) => ({ v: vector(r, 3, -8, 8) }),
        reference: (x) => ({ x: vec(x.v)[0]!, y: vec(x.v)[1]!, z: vec(x.v)[2]! }),
    },
    unary(
        'math.combine3',
        1e-6,
        (r) => ({ x: uniform(r, -8, 8), y: uniform(r, -8, 8), z: uniform(r, -8, 8) }),
        (x) => [num(x.x), num(x.y), num(x.z)],
    ),
    {
        node: 'math.split4',
        tolerance: 1e-6,
        sample: (r) => ({ v: vector(r, 4, -8, 8) }),
        reference: (x) => {
            const v = vec(x.v);
            return { x: v[0]!, y: v[1]!, z: v[2]!, w: v[3]! };
        },
    },
    unary(
        'math.combine4',
        1e-6,
        (r) => ({
            x: uniform(r, -8, 8),
            y: uniform(r, -8, 8),
            z: uniform(r, -8, 8),
            w: uniform(r, -8, 8),
        }),
        (x) => [num(x.x), num(x.y), num(x.z), num(x.w)],
    ),
];
