// Construção de matrizes (spec 005, R6): de quaternion, de colunas, TRS, transformação 3×3 de vetores, inversa
// rígida e extração da rotação por decomposição polar. Requer `quat` e `linalg`.

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

// Inversa exata de uma matriz rígida (rotação + translação, sem escala).
// M = [R | t]  →  M⁻¹ = [Rᵀ | -Rᵀ·t]
fn rigid_mat4_inverse(m: mat4x4f) -> mat4x4f {
    // Rᵀ: transposta da parte 3×3 (column-major: m[col][row])
    let r0 = vec3f(m[0].x, m[1].x, m[2].x);  // linha 0 de R
    let r1 = vec3f(m[0].y, m[1].y, m[2].y);  // linha 1 de R
    let r2 = vec3f(m[0].z, m[1].z, m[2].z);  // linha 2 de R
    let t  = m[3].xyz;
    // −Rᵀ · t: a componente i é −(coluna i de R) · t (spec 007 corrigiu o uso das linhas, que dava −R · t).
    let it = vec3f(-dot(m[0].xyz, t), -dot(m[1].xyz, t), -dot(m[2].xyz, t));
    return mat4x4f(
        vec4f(r0, 0.0),
        vec4f(r1, 0.0),
        vec4f(r2, 0.0),
        vec4f(it, 1.0),
    );
}

// Extrai a rotação R de A_pq tal que A_pq ≈ R·S (decomposição polar).
// Usa iteração de quaternion convergindo em 4-6 iterações para deformações típicas.
//
// A_pq   — gradiente de deformação (Σ w_i · (pred_i − cm) ⊗ r_i)
// q_prev — quaternion da iteração anterior (warm-start); (0,0,0,1) = identidade
// Retorna quaternion XYZW representando R.
//
// Requer: mat3_from_quat (mat.wgsl), quat_normalize + quat_apply_angular_delta (quat.wgsl).
fn polar_decomp_quaternion(A_pq: mat3x3f, q_prev: vec4f) -> vec4f {
    var q = q_prev;
    for (var k = 0u; k < 6u; k++) {
        let R    = mat3_from_quat(q);
        let AR_t = mat3_mul(A_pq, mat3_transpose(R));
        // Parte anti-simétrica de AR^T → vetor de correção angular
        let omega = vec3f(
            AR_t[1].z - AR_t[2].y,
            AR_t[2].x - AR_t[0].z,
            AR_t[0].y - AR_t[1].x,
        );
        let denom = abs(AR_t[0].x + AR_t[1].y + AR_t[2].z) + 1e-9;
        let omega_scaled = omega / denom;
        if (dot(omega_scaled, omega_scaled) < 1e-12) { break; }
        q = quat_apply_angular_delta(q, 0.5 * omega_scaled);
    }
    return quat_normalize(q);
}
