// Álgebra linear 3×3 (spec 005, R6/R11): determinante, inversa, transposta, produto, norma de Frobenius.
// WGSL `mat3x3f` é column-major: m[col][row].

// Adjunta (a transposta dos cofatores) de mat3x3f: a inversa vezes o determinante — sem dividir, para quem já tem o
// determinante (ou o guarda) à mão.
fn mat3_adjugate(m: mat3x3f) -> mat3x3f {
    return transpose(mat3x3f(cross(m[1], m[2]), cross(m[2], m[0]), cross(m[0], m[1])));
}

// Transposta de mat3x3f (column-major: m[col][row]).
fn mat3_transpose(m: mat3x3f) -> mat3x3f {
    return mat3x3f(
        vec3f(m[0].x, m[1].x, m[2].x),
        vec3f(m[0].y, m[1].y, m[2].y),
        vec3f(m[0].z, m[1].z, m[2].z),
    );
}

// Determinante de mat3x3f via expansão da primeira linha.
fn mat3_det(m: mat3x3f) -> f32 {
    return
          m[0].x * (m[1].y*m[2].z - m[2].y*m[1].z)
        - m[1].x * (m[0].y*m[2].z - m[2].y*m[0].z)
        + m[2].x * (m[0].y*m[1].z - m[1].y*m[0].z);
}

// Inversa de mat3x3f via matriz adjunta / determinante.
// Caller deve garantir det != 0 (ou tolerar NaN/Inf).
fn mat3_inverse(m: mat3x3f) -> mat3x3f {
    let det = mat3_det(m);
    let inv_det = 1.0 / det;
    let c00 =  (m[1].y*m[2].z - m[2].y*m[1].z) * inv_det;
    let c01 = -(m[0].y*m[2].z - m[2].y*m[0].z) * inv_det;
    let c02 =  (m[0].y*m[1].z - m[1].y*m[0].z) * inv_det;
    let c10 = -(m[1].x*m[2].z - m[2].x*m[1].z) * inv_det;
    let c11 =  (m[0].x*m[2].z - m[2].x*m[0].z) * inv_det;
    let c12 = -(m[0].x*m[1].z - m[1].x*m[0].z) * inv_det;
    let c20 =  (m[1].x*m[2].y - m[2].x*m[1].y) * inv_det;
    let c21 = -(m[0].x*m[2].y - m[2].x*m[0].y) * inv_det;
    let c22 =  (m[0].x*m[1].y - m[1].x*m[0].y) * inv_det;
    // Já vem como adjunta transposta (cofactor[col][row]) → forma colunas direto.
    return mat3x3f(
        vec3f(c00, c01, c02),
        vec3f(c10, c11, c12),
        vec3f(c20, c21, c22),
    );
}

// Multiplicação A × B (column-major). WGSL operator * sobre mat3x3f já faz isso,
// mas mantemos wrapper nominal para clareza dos call sites em kernels MPM/FEM.
fn mat3_mul(a: mat3x3f, b: mat3x3f) -> mat3x3f {
    return a * b;
}

// ||m||_F = sqrt(sum of squares of all entries).
// Usada na restrição desviadora C_d = ||F||_F - sqrt(3).
fn mat3_frobenius_norm(m: mat3x3f) -> f32 {
    return sqrt(dot(m[0], m[0]) + dot(m[1], m[1]) + dot(m[2], m[2]));
}
