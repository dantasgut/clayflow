// portado de legacy/elements/physics/gpu/wgsl/math/mat.wgsl.ts
// ── Operações matriciais ─────────────────────────────────────────────────────

// Transforma v pela parte superior 3×3 de uma mat4x4f (rotation+scale, sem translação).
// Usado para transformar normais e gradientes SDF de espaço local para mundo.
// WGSL mat4x4f é column-major: m[col][row], portanto m[col].x = elemento (row=0, col).
fn mat4_upper3x3_transform(m: mat4x4f, v: vec3f) -> vec3f {
    return vec3f(
        m[0].x*v.x + m[1].x*v.y + m[2].x*v.z,
        m[0].y*v.x + m[1].y*v.y + m[2].y*v.z,
        m[0].z*v.x + m[1].z*v.y + m[2].z*v.z,
    );
}

// Constrói uma mat3x3f de rotação pura a partir de um quaternion normalizado.
// Útil quando múltiplas transformações de vetor são necessárias para o mesmo corpo.
fn mat3_from_quat(q: vec4f) -> mat3x3f {
    let x2 = q.x*q.x; let y2 = q.y*q.y; let z2 = q.z*q.z;
    let xy = q.x*q.y; let xz = q.x*q.z; let yz = q.y*q.z;
    let wx = q.w*q.x; let wy = q.w*q.y; let wz = q.w*q.z;
    // Colunas da matriz de rotação (column-major)
    return mat3x3f(
        vec3f(1.0-2.0*(y2+z2), 2.0*(xy+wz),     2.0*(xz-wy)    ),
        vec3f(2.0*(xy-wz),     1.0-2.0*(x2+z2), 2.0*(yz+wx)    ),
        vec3f(2.0*(xz+wy),     2.0*(yz-wx),     1.0-2.0*(x2+y2)),
    );
}

// Constrói mat4x4f (column-major) de transformação rígida a partir de quaternion q e posição t.
// q deve ser normalizado. Equivale a TRS sem escala (scale=1).
fn quat_to_mat4(q: vec4f, t: vec3f) -> mat4x4f {
    let x2 = q.x*q.x; let y2 = q.y*q.y; let z2 = q.z*q.z;
    let xy = q.x*q.y; let xz = q.x*q.z; let yz = q.y*q.z;
    let wx = q.w*q.x; let wy = q.w*q.y; let wz = q.w*q.z;
    return mat4x4f(
        vec4f(1.0-2.0*(y2+z2), 2.0*(xy+wz),     2.0*(xz-wy),     0.0),
        vec4f(2.0*(xy-wz),     1.0-2.0*(x2+z2), 2.0*(yz+wx),     0.0),
        vec4f(2.0*(xz+wy),     2.0*(yz-wx),     1.0-2.0*(x2+y2), 0.0),
        vec4f(t.x, t.y, t.z, 1.0),
    );
}

// Constrói mat3x3f (column-major) a partir de três vetores-coluna.
// Helper para reidratar matrizes armazenadas como 3 vec4f em structs (MPM F, C, etc.).
fn mat3_from_cols(c0: vec3f, c1: vec3f, c2: vec3f) -> mat3x3f {
    return mat3x3f(c0, c1, c2);
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

// Inversa exata de uma matriz rígida (rotação + translação, sem escala).
// M = [R | t]  →  M⁻¹ = [Rᵀ | -Rᵀ·t]
fn rigid_mat4_inverse(m: mat4x4f) -> mat4x4f {
    // Rᵀ: transposta da parte 3×3 (column-major: m[col][row])
    let r0 = vec3f(m[0].x, m[1].x, m[2].x);  // linha 0 de R
    let r1 = vec3f(m[0].y, m[1].y, m[2].y);  // linha 1 de R
    let r2 = vec3f(m[0].z, m[1].z, m[2].z);  // linha 2 de R
    let tx = m[3].x; let ty = m[3].y; let tz = m[3].z;
    let t  = vec3f(tx, ty, tz);
    // -Rᵀ · t
    let it = vec3f(-dot(r0, t), -dot(r1, t), -dot(r2, t));
    return mat4x4f(
        vec4f(r0, 0.0),
        vec4f(r1, 0.0),
        vec4f(r2, 0.0),
        vec4f(it, 1.0),
    );
}
