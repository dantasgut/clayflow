// Construção de matrizes (spec 005, R6): de quaternion, de colunas e a extração da rotação por decomposição polar.
// As transformações por classe estão em `xform_*` (spec 037). Requer `quat` e `linalg`.

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

// Constrói mat3x3f (column-major) a partir de três vetores-coluna.
// Helper para reidratar matrizes armazenadas como 3 vec4f em structs (MPM F, C, etc.).
fn mat3_from_cols(c0: vec3f, c1: vec3f, c2: vec3f) -> mat3x3f {
    return mat3x3f(c0, c1, c2);
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
