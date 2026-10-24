// Referência f64 única das transformações (spec 037, R3): as mesmas operações por classe que a família WGSL
// (`rigid_*`, `affine_*`, `projective_*`, TRS, 3×3). Matrizes em colunas, como no WGSL: `m[4·c + r]` (4×4) e
// `m[3·c + r]` (3×3). Tolerâncias da GPU contra esta referência (FR-006): rígida e TRS ≤ 4 ulp por componente; afim
// ≤ 1e-5 relativo com número de condição ≤ 1e3; projetiva ≤ 1e-5 relativo no ponto reprojetado.

export type Vec3 = readonly [number, number, number];
/** 4×4 em colunas. */
export type Mat4 = readonly number[];
/** 3×3 em colunas. */
export type Mat3 = readonly number[];

/** Abaixo deste |det| a parte 3×3 é tratada como singular e a inversa afim é a identidade (a guarda da GPU). */
export const AFFINE_SINGULAR_DET = 1e-20;

export const MAT4_IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Produto `a · b` de 4×4 (vale para as três classes: compor). */
export function mat4Multiply(a: Mat4, b: Mat4): number[] {
    const out = new Array<number>(16);
    for (let c = 0; c < 4; c++)
        for (let r = 0; r < 4; r++)
            out[4 * c + r] =
                a[r]! * b[4 * c]!
                + a[4 + r]! * b[4 * c + 1]!
                + a[8 + r]! * b[4 * c + 2]!
                + a[12 + r]! * b[4 * c + 3]!;
    return out;
}

/** A parte 3×3 (colunas) de uma 4×4. */
export const mat4Upper3 = (m: Mat4): number[] => [
    m[0]!,
    m[1]!,
    m[2]!,
    m[4]!,
    m[5]!,
    m[6]!,
    m[8]!,
    m[9]!,
    m[10]!,
];

/** Determinante de 3×3 pela primeira linha (a ordem de `mat3_det`). */
export function mat3Det(m: Mat3): number {
    const [a, b, c, d, e, f, g, h, i] = m as number[];
    return a! * (e! * i! - f! * h!) - d! * (b! * i! - c! * h!) + g! * (b! * f! - c! * e!);
}

/** Inversa de 3×3 (adjunta / determinante); singular dá não finitos, como na GPU. */
export function mat3Inverse(m: Mat3): number[] {
    const [a, b, c, d, e, f, g, h, i] = m as number[];
    const s = 1 / mat3Det(m);
    return [
        (e! * i! - f! * h!) * s,
        (c! * h! - b! * i!) * s,
        (b! * f! - c! * e!) * s,
        (f! * g! - d! * i!) * s,
        (a! * i! - c! * g!) * s,
        (c! * d! - a! * f!) * s,
        (d! * h! - e! * g!) * s,
        (b! * g! - a! * h!) * s,
        (a! * e! - b! * d!) * s,
    ];
}

export const mat3Transpose = (m: Mat3): number[] => [
    m[0]!,
    m[3]!,
    m[6]!,
    m[1]!,
    m[4]!,
    m[7]!,
    m[2]!,
    m[5]!,
    m[8]!,
];

/** `m · v` de 3×3. */
export function mat3Apply(m: Mat3, v: Vec3): Vec3 {
    return [
        m[0]! * v[0] + m[3]! * v[1] + m[6]! * v[2],
        m[1]! * v[0] + m[4]! * v[1] + m[7]! * v[2],
        m[2]! * v[0] + m[5]! * v[1] + m[8]! * v[2],
    ];
}

/** 4×4 afim de uma 3×3 e uma translação. */
export function mat4FromAffine(m3: Mat3, t: Vec3): number[] {
    return [
        m3[0]!,
        m3[1]!,
        m3[2]!,
        0,
        m3[3]!,
        m3[4]!,
        m3[5]!,
        0,
        m3[6]!,
        m3[7]!,
        m3[8]!,
        0,
        t[0],
        t[1],
        t[2],
        1,
    ];
}

// ── Afim (3×3 + translação) ────────────────────────────────────────────────────────────────────────────────────────

/** Ponto: `M3·p + t`. */
export function affinePoint(m: Mat4, p: Vec3): Vec3 {
    return [
        m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2] + m[12]!,
        m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2] + m[13]!,
        m[2]! * p[0] + m[6]! * p[1] + m[10]! * p[2] + m[14]!,
    ];
}

/** Direção: `M3·d`. */
export function affineDirection(m: Mat4, d: Vec3): Vec3 {
    return [
        m[0]! * d[0] + m[4]! * d[1] + m[8]! * d[2],
        m[1]! * d[0] + m[5]! * d[1] + m[9]! * d[2],
        m[2]! * d[0] + m[6]! * d[1] + m[10]! * d[2],
    ];
}

/** `[M3 | t]⁻¹ = [M3⁻¹ | −M3⁻¹·t]`; |det| ≤ `AFFINE_SINGULAR_DET` dá a identidade. */
export function affineInverse(m: Mat4): number[] {
    const m3 = mat4Upper3(m);
    if (Math.abs(mat3Det(m3)) <= AFFINE_SINGULAR_DET) return [...MAT4_IDENTITY];
    const r = mat3Inverse(m3);
    const t = mat3Apply(r, [m[12]!, m[13]!, m[14]!]);
    return mat4FromAffine(r, [-t[0], -t[1], -t[2]]);
}

/** Matriz das normais: `(M3⁻¹)ᵀ`. */
export const affineNormal = (m: Mat4): number[] => mat3Transpose(mat3Inverse(mat4Upper3(m)));

/** Caixa de mundo de uma caixa de objeto (os 8 cantos). */
export function affineBox(
    m: Mat4,
    box: { readonly min: Vec3; readonly max: Vec3 },
): { min: Vec3; max: Vec3 } {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < 8; k++) {
        const p = affinePoint(m, [
            k & 1 ? box.max[0] : box.min[0],
            k & 2 ? box.max[1] : box.min[1],
            k & 4 ? box.max[2] : box.min[2],
        ]);
        for (let a = 0; a < 3; a++) {
            min[a] = Math.min(min[a]!, p[a]!);
            max[a] = Math.max(max[a]!, p[a]!);
        }
    }
    return { min: min as unknown as Vec3, max: max as unknown as Vec3 };
}

// ── Rígida (rotação + translação) ──────────────────────────────────────────────────────────────────────────────────

/** `[R | t]⁻¹ = [Rᵀ | −Rᵀ·t]`. */
export function rigidInverse(m: Mat4): number[] {
    const rt = mat3Transpose(mat4Upper3(m));
    const t = mat3Apply(rt, [m[12]!, m[13]!, m[14]!]);
    return mat4FromAffine(rt, [-t[0], -t[1], -t[2]]);
}

export const rigidPoint = affinePoint;
export const rigidDirection = affineDirection;

// ── Projetiva (4×4) ────────────────────────────────────────────────────────────────────────────────────────────────

/** `m · (x, y, z, w)`. */
export function mat4Apply(m: Mat4, v: readonly [number, number, number, number]): number[] {
    return [0, 1, 2, 3].map(
        (r) => m[r]! * v[0] + m[4 + r]! * v[1] + m[8 + r]! * v[2] + m[12 + r]! * v[3],
    );
}

/** Ponto projetado: `clip.xyz / clip.w`. */
export function projectivePoint(m: Mat4, p: Vec3): Vec3 {
    const c = mat4Apply(m, [p[0], p[1], p[2], 1]);
    return [c[0]! / c[3]!, c[1]! / c[3]!, c[2]! / c[3]!];
}

/** Inversa geral de 4×4 (cofatores / determinante). */
export function projectiveInverse(m: Mat4): number[] {
    const minor = (skipC: number, skipR: number): number => {
        const cs = [0, 1, 2, 3].filter((k) => k !== skipC);
        const rs = [0, 1, 2, 3].filter((k) => k !== skipR);
        return mat3Det(cs.flatMap((c) => rs.map((r) => m[4 * c + r]!)));
    };
    const cof = (c: number, r: number): number => ((c + r) % 2 === 0 ? 1 : -1) * minor(c, r);
    let det = 0;
    for (let c = 0; c < 4; c++) det += m[4 * c]! * cof(c, 0);
    // inversa[c][r] = cofator(r, c) / det.
    return [0, 1, 2, 3].flatMap((c) => [0, 1, 2, 3].map((r) => cof(r, c) / det));
}

// ── TRS (posição, quaternion, escala): convenção M = T · R · S ─────────────────────────────────────────────────────

const TRS_QUAT_EPSILON = 1e-7;
const TRS_SCALE_EPSILON = 1e-12;

/** Rotação 3×3 (colunas) de um quaternion xyzw; módulo ≤ 1e-7 vira identidade, o resto é normalizado (como a GPU). */
export function quatMatrix(q: readonly [number, number, number, number]): number[] {
    const l = Math.hypot(q[0], q[1], q[2], q[3]);
    const [x, y, z, w] = l > TRS_QUAT_EPSILON ? q.map((v) => v / l) : [0, 0, 0, 1];
    return [
        1 - 2 * (y! * y! + z! * z!),
        2 * (x! * y! + w! * z!),
        2 * (x! * z! - w! * y!),
        2 * (x! * y! - w! * z!),
        1 - 2 * (x! * x! + z! * z!),
        2 * (y! * z! + w! * x!),
        2 * (x! * z! + w! * y!),
        2 * (y! * z! - w! * x!),
        1 - 2 * (x! * x! + y! * y!),
    ];
}

/** Matriz de mundo `T · R · S`. */
export function trsWorld(
    position: Vec3,
    rotation: readonly [number, number, number, number],
    scale: Vec3,
): number[] {
    const r = quatMatrix(rotation);
    return mat4FromAffine(
        r.map((v, k) => v * scale[Math.floor(k / 3)]!),
        position,
    );
}

/** Matriz das normais `R · S⁻¹`; escala 0 anula o eixo (o recíproco seguro da GPU). */
export function trsNormal(
    rotation: readonly [number, number, number, number],
    scale: Vec3,
): number[] {
    const r = quatMatrix(rotation);
    const inv = scale.map((s) => (Math.abs(s) > TRS_SCALE_EPSILON ? 1 / s : 0));
    return r.map((v, k) => v * inv[Math.floor(k / 3)]!);
}
