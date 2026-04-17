/**
 * Módulo WGSL: Shape Matching — decomposição polar via iteração de quaternion.
 *
 * Implementa o método de Müller et al. 2016:
 * "A Robust Method to Extract the Rotational Part of Deformations"
 *
 * Funções auxiliares de matriz 3×3 e decomposição polar usadas pelos kernels
 * shape_match_transform e shape_correct.
 *
 * Depende de: mat.wgsl (mat3_from_quat), quat.wgsl (quat_normalize, quat_apply_angular_delta).
 */
export const WGSL_SHAPE_MATCHING = /* wgsl */`

// ── Operações de matriz 3×3 ───────────────────────────────────────────────────

// Produto de matrizes 3×3 (column-major WGSL: m[col][row]).
fn mat3_mul(A: mat3x3f, B: mat3x3f) -> mat3x3f {
    return mat3x3f(A * B[0], A * B[1], A * B[2]);
}

// Transposta de uma matriz 3×3.
fn mat3_transpose(M: mat3x3f) -> mat3x3f {
    return mat3x3f(
        vec3f(M[0].x, M[1].x, M[2].x),
        vec3f(M[0].y, M[1].y, M[2].y),
        vec3f(M[0].z, M[1].z, M[2].z),
    );
}

// Determinante de uma matriz 3×3.
fn mat3_det(M: mat3x3f) -> f32 {
    return M[0].x * (M[1].y*M[2].z - M[2].y*M[1].z)
         - M[0].y * (M[1].x*M[2].z - M[2].x*M[1].z)
         + M[0].z * (M[1].x*M[2].y - M[2].x*M[1].y);
}

// ── Decomposição polar ────────────────────────────────────────────────────────

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
`;
