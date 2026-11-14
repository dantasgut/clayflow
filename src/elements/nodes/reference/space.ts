// Referência da CPU dos nós de conversão de espaço (spec 031, R12): matrizes 4×4 em colunas (como no WGSL), em f64.
// Tolerância 1e-5 (`|gpu − ref| ≤ tol · max(1, |ref|)`): produtos e somas em f32, e na normal, na inversa e na projeção
// uma divisão (determinante, `w`).
import {
    affineDirection,
    affineInverse,
    affineNormal,
    affinePoint,
    mat3Apply,
    projectiveInverse,
    projectivePoint,
    rigidInverse,
    trsWorld,
    type Vec3,
} from '../../math/reference/xform';
import { uniform, vec, vector, type NodeCase, type NodeValues } from './cases';

type V = readonly number[];
const v3 = (v: V): Vec3 => [v[0]!, v[1]!, v[2]!];

/** `space.point`. */
export const spaceApplyPoint = (m: V, p: V): number[] => [...affinePoint(m, v3(p))];
/** `space.direction`. */
const spaceApplyDirection = (m: V, d: V): number[] => [...affineDirection(m, v3(d))];

/** `space.normal`: inversa transposta da parte 3×3 aplicada a `n`, normalizada. */
export function spaceApplyNormal(m: V, n: V): number[] {
    const t = mat3Apply(affineNormal(m), v3(n));
    const l = Math.hypot(t[0], t[1], t[2]);
    return t.map((x) => x / l);
}

/** `space.inverse`: `[R | t]⁻¹ = [R⁻¹ | −R⁻¹·t]`. */
export const spaceInverseAffine = (m: V): number[] => affineInverse(m);

/** `space.project`: `clip.xyz / clip.w`. */
export const spaceProjectPoint = (m: V, p: V): number[] => [...projectivePoint(m, v3(p))];

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

/** Matriz rígida aleatória em colunas: rotação (quaternion aleatório) e translação em [−3, 3]. */
function rigid(random: () => number): number[] {
    const q = vector(random, 4, -1, 1);
    const l = Math.hypot(...q) || 1;
    return trsWorld(
        v3(vector(random, 3, -3, 3)),
        q.map((v) => v / l) as [number, number, number, number],
        [1, 1, 1],
    );
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
        node: 'space.inverseRigid',
        tolerance: 1e-5,
        sample: (r) => ({ m: rigid(r) }),
        reference: (x) => ({ value: rigidInverse(vec(x.m)) }),
    },
    {
        node: 'space.inverseProjective',
        tolerance: 1e-5,
        sample: (r) => ({ m: perspective(r) }),
        reference: (x) => ({ value: projectiveInverse(vec(x.m)) }),
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
