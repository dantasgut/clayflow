// Referência da CPU dos nós de conversão de espaço (spec 031, R12): matrizes 4×4 em colunas (como no WGSL), em f64.
// Tolerância 1e-5 (`|gpu − ref| ≤ tol · max(1, |ref|)`): produtos e somas em f32, e na normal, na inversa e na projeção
// uma divisão (determinante, `w`).
import { uniform, vec, vector, type NodeCase, type NodeValues } from './cases';

type V = readonly number[];

/** `m · (x, y, z, w)` com `m` em colunas. */
function apply(m: V, v: V, w: number): number[] {
    return [0, 1, 2, 3].map(
        (r) => m[r]! * v[0]! + m[4 + r]! * v[1]! + m[8 + r]! * v[2]! + m[12 + r]! * w,
    );
}

/** A parte 3×3 (colunas) de uma 4×4 em colunas. */
const upper = (m: V): number[] => [m[0]!, m[1]!, m[2]!, m[4]!, m[5]!, m[6]!, m[8]!, m[9]!, m[10]!];

/** Inversa de uma 3×3 em colunas (adjunta / determinante). */
function inverse3(a: V): number[] {
    const e = (c: number, r: number): number => a[c * 3 + r]!;
    const cof = (c: number, r: number): number => {
        const cs = [0, 1, 2].filter((k) => k !== c);
        const rs = [0, 1, 2].filter((k) => k !== r);
        const minor = e(cs[0]!, rs[0]!) * e(cs[1]!, rs[1]!) - e(cs[1]!, rs[0]!) * e(cs[0]!, rs[1]!);
        return (c + r) % 2 === 0 ? minor : -minor;
    };
    const det = e(0, 0) * cof(0, 0) + e(1, 0) * cof(1, 0) + e(2, 0) * cof(2, 0);
    // inversa[c][r] = cofator(r, c) / det (a adjunta é a transposta dos cofatores).
    return [0, 1, 2].flatMap((c) => [0, 1, 2].map((r) => cof(r, c) / det));
}

/** `space.point`. */
export const spaceApplyPoint = (m: V, p: V): number[] => apply(m, p, 1).slice(0, 3);
/** `space.direction`. */
const spaceApplyDirection = (m: V, d: V): number[] => apply(m, d, 0).slice(0, 3);

/** `space.normal`: inversa transposta da parte 3×3 aplicada a `n`, normalizada. */
export function spaceApplyNormal(m: V, n: V): number[] {
    const inv = inverse3(upper(m));
    // (inv)ᵀ · n: a componente c é a coluna c de inv com n.
    const t = [0, 1, 2].map(
        (c) => inv[c * 3]! * n[0]! + inv[c * 3 + 1]! * n[1]! + inv[c * 3 + 2]! * n[2]!,
    );
    const l = Math.hypot(t[0]!, t[1]!, t[2]!);
    return t.map((x) => x / l);
}

/** `space.inverse`: `[R | t]⁻¹ = [R⁻¹ | −R⁻¹·t]`. */
export function spaceInverseAffine(m: V): number[] {
    const r = inverse3(upper(m));
    const t = [m[12]!, m[13]!, m[14]!];
    const it = [0, 1, 2].map((k) => -(r[k]! * t[0]! + r[3 + k]! * t[1]! + r[6 + k]! * t[2]!));
    return [
        r[0]!,
        r[1]!,
        r[2]!,
        0,
        r[3]!,
        r[4]!,
        r[5]!,
        0,
        r[6]!,
        r[7]!,
        r[8]!,
        0,
        it[0]!,
        it[1]!,
        it[2]!,
        1,
    ];
}

/** `space.project`: `clip.xyz / clip.w`. */
export function spaceProjectPoint(m: V, p: V): number[] {
    const c = apply(m, p, 1);
    return [c[0]! / c[3]!, c[1]! / c[3]!, c[2]! / c[3]!];
}

/**
 * Matriz afim aleatória em colunas: rotação (quaternion aleatório), escala não uniforme em [0,5; 2] (uma amostra em
 * quatro espelhada) e translação em [−3, 3].
 */
function affine(random: () => number, k: number): number[] {
    const q = vector(random, 4, -1, 1);
    const l = Math.hypot(...q) || 1;
    const [x, y, z, w] = q.map((v) => v / l) as [number, number, number, number];
    const rot = [
        1 - 2 * (y * y + z * z),
        2 * (x * y + z * w),
        2 * (x * z - y * w),
        2 * (x * y - z * w),
        1 - 2 * (x * x + z * z),
        2 * (y * z + x * w),
        2 * (x * z + y * w),
        2 * (y * z - x * w),
        1 - 2 * (x * x + y * y),
    ];
    const s = vector(random, 3, 0.5, 2);
    if (k % 4 === 3) s[0] = -s[0]!;
    const t = vector(random, 3, -3, 3);
    return [
        rot[0]! * s[0]!,
        rot[1]! * s[0]!,
        rot[2]! * s[0]!,
        0,
        rot[3]! * s[1]!,
        rot[4]! * s[1]!,
        rot[5]! * s[1]!,
        0,
        rot[6]! * s[2]!,
        rot[7]! * s[2]!,
        rot[8]! * s[2]!,
        0,
        t[0]!,
        t[1]!,
        t[2]!,
        1,
    ];
}

/** Projeção perspectiva aleatória (profundidade [0, 1], olhando para −z), em colunas. */
function perspective(random: () => number): number[] {
    const f = 1 / Math.tan(uniform(random, 0.3, 1.2) / 2);
    const aspect = uniform(random, 0.5, 2);
    const near = uniform(random, 0.05, 0.5);
    const far = uniform(random, 20, 100);
    const nf = 1 / (near - far);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, far * nf, -1, 0, 0, near * far * nf, 0];
}

const mp = (r: () => number, k: number): NodeValues => ({
    m: affine(r, k),
    p: vector(r, 3, -4, 4),
});

/** Casos dos nós `space.*`. */
export const spaceCases: readonly NodeCase[] = [
    {
        node: 'space.point',
        tolerance: 1e-5,
        sample: mp,
        reference: (x) => ({ value: spaceApplyPoint(vec(x.m), vec(x.p)) }),
    },
    {
        node: 'space.direction',
        tolerance: 1e-5,
        sample: (r, k) => ({ m: affine(r, k), d: vector(r, 3, -4, 4) }),
        reference: (x) => ({ value: spaceApplyDirection(vec(x.m), vec(x.d)) }),
    },
    {
        node: 'space.normal',
        tolerance: 1e-5,
        sample: (r, k) => {
            const n = vector(r, 3, -1, 1);
            const l = Math.hypot(...n) || 1;
            return { m: affine(r, k), n: n.map((v) => (v / l) * uniform(r, 0.5, 2)) };
        },
        reference: (x) => ({ value: spaceApplyNormal(vec(x.m), vec(x.n)) }),
    },
    {
        node: 'space.inverse',
        tolerance: 1e-5,
        sample: (r, k) => ({ m: affine(r, k) }),
        reference: (x) => ({ value: spaceInverseAffine(vec(x.m)) }),
    },
    {
        node: 'space.project',
        tolerance: 1e-5,
        sample: (r) => ({
            m: perspective(r),
            p: [uniform(r, -2, 2), uniform(r, -2, 2), uniform(r, -10, -1)],
        }),
        reference: (x) => ({ value: spaceProjectPoint(vec(x.m), vec(x.p)) }),
    },
];
