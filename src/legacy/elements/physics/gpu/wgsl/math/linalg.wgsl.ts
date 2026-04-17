/**
 * Módulo WGSL: álgebra linear para FEM — operações mat3x3f.
 *
 * Fornece determinante, inversa, transposta e produto de matrizes 3×3,
 * além de norma de Frobenius — primitivas necessárias para o gradiente
 * de deformação F e as restrições hidrostática/desviadora do XPBD-FEM.
 *
 * Convenção WGSL (column-major):
 *   m[col][row] — m[0] = coluna 0, m[1] = coluna 1, m[2] = coluna 2.
 *
 * Depende de: nenhum outro módulo.
 */
export const WGSL_LINALG = /* wgsl */`

// ── Determinante ─────────────────────────────────────────────────────────────

// det3(m) = escalar determinante de uma mat3x3f.
// Expansão de cofatores pela primeira coluna.
fn mat3_det(m: mat3x3f) -> f32 {
    return  m[0].x * (m[1].y * m[2].z - m[2].y * m[1].z)
          - m[1].x * (m[0].y * m[2].z - m[2].y * m[0].z)
          + m[2].x * (m[0].y * m[1].z - m[1].y * m[0].z);
}

// ── Inversa ───────────────────────────────────────────────────────────────────

// Inversa de mat3x3f via adjugada / det.
// Retorna identity se |det| < 1e-12 (matriz singular).
fn mat3_inverse(m: mat3x3f) -> mat3x3f {
    let det = mat3_det(m);
    if (abs(det) < 1e-12) { return mat3x3f(); }  // identidade
    let inv_det = 1.0 / det;
    // Cofatores (transpostos = adjugada / det = inversa)
    // coluna 0 da inversa
    let c00 =  (m[1].y * m[2].z - m[2].y * m[1].z) * inv_det;
    let c10 = -(m[1].x * m[2].z - m[2].x * m[1].z) * inv_det;
    let c20 =  (m[1].x * m[2].y - m[2].x * m[1].y) * inv_det;
    // coluna 1 da inversa
    let c01 = -(m[0].y * m[2].z - m[2].y * m[0].z) * inv_det;
    let c11 =  (m[0].x * m[2].z - m[2].x * m[0].z) * inv_det;
    let c21 = -(m[0].x * m[2].y - m[2].x * m[0].y) * inv_det;
    // coluna 2 da inversa
    let c02 =  (m[0].y * m[1].z - m[1].y * m[0].z) * inv_det;
    let c12 = -(m[0].x * m[1].z - m[1].x * m[0].z) * inv_det;
    let c22 =  (m[0].x * m[1].y - m[1].x * m[0].y) * inv_det;
    return mat3x3f(
        vec3f(c00, c01, c02),
        vec3f(c10, c11, c12),
        vec3f(c20, c21, c22),
    );
}

// ── Transposta ────────────────────────────────────────────────────────────────

fn mat3_transpose(m: mat3x3f) -> mat3x3f {
    return mat3x3f(
        vec3f(m[0].x, m[1].x, m[2].x),
        vec3f(m[0].y, m[1].y, m[2].y),
        vec3f(m[0].z, m[1].z, m[2].z),
    );
}

// ── Produto matricial ─────────────────────────────────────────────────────────

// a × b (a * b), retorna mat3x3f.
fn mat3_mul(a: mat3x3f, b: mat3x3f) -> mat3x3f {
    return mat3x3f(
        a * b[0],
        a * b[1],
        a * b[2],
    );
}

// ── Norma de Frobenius ────────────────────────────────────────────────────────

// ||m||_F = sqrt(sum of squares of all entries).
// Usada na restrição desviadora C_d = ||F||_F - sqrt(3).
fn mat3_frobenius_norm(m: mat3x3f) -> f32 {
    return sqrt(dot(m[0], m[0]) + dot(m[1], m[1]) + dot(m[2], m[2]));
}

// ── Construção a partir de colunas ────────────────────────────────────────────

fn mat3_from_cols(c0: vec3f, c1: vec3f, c2: vec3f) -> mat3x3f {
    return mat3x3f(c0, c1, c2);
}
`;
