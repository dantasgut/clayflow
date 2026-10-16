// Referência da CPU dos nós de mapeamento e de rampa de cor (spec 031, R12). Tolerância 1e-5 (por componente,
// `|gpu − ref| ≤ tol · max(1, |ref|)`): uma divisão e uma interpolação em f32.
import { num, uniform, vec, vector, type NodeCase } from './cases';

type Vec3 = readonly [number, number, number];

const lerp = (a: number, b: number, t: number): number => a * (1 - t) + b * t;
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const span = (lo: number, hi: number): number => (Math.abs(hi - lo) < 1e-6 ? 1e-6 : hi - lo);

/** `map.range`: `x` de `[inMin, inMax]` para `[outMin, outMax]`, presa com `clamped` ≠ 0. */
export function mapRange(
    x: number,
    inMin: number,
    inMax: number,
    outMin: number,
    outMax: number,
    clamped: number,
): number {
    const t = (x - inMin) / span(inMin, inMax);
    return lerp(outMin, outMax, clamped !== 0 ? clamp01(t) : t);
}

/** `map.curve4`: linear por trecho pelos pontos `(x, y)` (x crescente), constante fora dos extremos. */
export function mapCurve4(x: number, points: readonly (readonly number[])[]): number {
    const p = points;
    if (x <= p[0]![0]!) return p[0]![1]!;
    for (let k = 1; k < p.length; k++) {
        const a = p[k - 1]!;
        const b = p[k]!;
        if (x <= b[0]!) return lerp(a[1]!, b[1]!, clamp01((x - a[0]!) / span(a[0]!, b[0]!)));
    }
    return p[p.length - 1]![1]!;
}

/** `color.ramp`: linear de `colorA` em `low` a `colorB` em `high`, presa nos extremos. */
function colorRamp(
    t: number,
    colorA: Vec3,
    colorB: Vec3,
    low: number,
    high: number,
): [number, number, number] {
    const s = clamp01((t - low) / span(low, high));
    return [
        lerp(colorA[0], colorB[0], s),
        lerp(colorA[1], colorB[1], s),
        lerp(colorA[2], colorB[2], s),
    ];
}

/** `color.ramp4`: paradas `(r, g, b, posição)` em posições crescentes, linear por trecho, presa nos extremos. */
export function colorRamp4(t: number, stops: readonly (readonly number[])[]): number[] {
    const rgb = (s: readonly number[]): Vec3 => [s[0]!, s[1]!, s[2]!];
    if (t <= stops[0]![3]!) return [...rgb(stops[0]!)];
    for (let k = 1; k < stops.length; k++) {
        const a = stops[k - 1]!;
        const b = stops[k]!;
        if (t <= b[3]!) return colorRamp(t, rgb(a), rgb(b), a[3]!, b[3]!);
    }
    return [...rgb(stops[stops.length - 1]!)];
}

/** Posições crescentes em [lo, hi): `n` valores ordenados. */
const sorted = (random: () => number, n: number, lo: number, hi: number): number[] =>
    vector(random, n, lo, hi).sort((a, b) => a - b);

/** Casos dos nós `map.*` e `color.*`. */
export const mapCases: readonly NodeCase[] = [
    {
        node: 'map.range',
        tolerance: 1e-5,
        sample: (r, k) => {
            const inMin = uniform(r, -2, 1);
            return {
                x: uniform(r, -3, 4),
                in_min: inMin,
                in_max: inMin + uniform(r, 0.25, 3),
                out_min: uniform(r, -4, 4),
                out_max: uniform(r, -4, 4),
                clamped: k % 2,
            };
        },
        reference: (x) => ({
            value: mapRange(
                num(x.x),
                num(x.in_min),
                num(x.in_max),
                num(x.out_min),
                num(x.out_max),
                num(x.clamped),
            ),
        }),
    },
    {
        node: 'map.curve4',
        tolerance: 1e-5,
        sample: (r) => {
            const xs = sorted(r, 4, -2, 2);
            return {
                x: uniform(r, -3, 3),
                p0: [xs[0]!, uniform(r, -2, 2)],
                p1: [xs[1]!, uniform(r, -2, 2)],
                p2: [xs[2]!, uniform(r, -2, 2)],
                p3: [xs[3]!, uniform(r, -2, 2)],
            };
        },
        reference: (x) => ({
            value: mapCurve4(num(x.x), [vec(x.p0), vec(x.p1), vec(x.p2), vec(x.p3)]),
        }),
    },
    {
        node: 'color.ramp',
        tolerance: 1e-5,
        sample: (r) => {
            const low = uniform(r, -2, 1);
            return {
                t: uniform(r, -3, 4),
                color_a: vector(r, 3, 0, 1),
                color_b: vector(r, 3, 0, 1),
                low,
                high: low + uniform(r, 0.25, 3),
            };
        },
        reference: (x) => ({
            color: colorRamp(
                num(x.t),
                vec(x.color_a) as unknown as Vec3,
                vec(x.color_b) as unknown as Vec3,
                num(x.low),
                num(x.high),
            ),
        }),
    },
    {
        node: 'color.ramp4',
        tolerance: 1e-5,
        sample: (r) => {
            const at = sorted(r, 4, -1, 2);
            return {
                t: uniform(r, -2, 3),
                stop0: [...vector(r, 3, 0, 1), at[0]!],
                stop1: [...vector(r, 3, 0, 1), at[1]!],
                stop2: [...vector(r, 3, 0, 1), at[2]!],
                stop3: [...vector(r, 3, 0, 1), at[3]!],
            };
        },
        reference: (x) => ({
            color: colorRamp4(num(x.t), [vec(x.stop0), vec(x.stop1), vec(x.stop2), vec(x.stop3)]),
        }),
    },
];
