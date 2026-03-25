/**
 * Módulo WGSL: operações com quaternions (formato XYZW, consistente com gl-matrix).
 *
 * Funções universais reutilizadas por qualquer kernel de física —
 * RigidBody (integração, velocidade angular) e SoftBody (colisão orientada).
 */
export const WGSL_QUAT = /* wgsl */`

// ── Quaternion — formato XYZW ────────────────────────────────────────────────

fn quat_normalize(q: vec4f) -> vec4f {
    let len = length(q);
    return select(q, q / len, len > 1e-7);
}

// q_a ⊗ q_b
fn quat_mul(a: vec4f, b: vec4f) -> vec4f {
    return vec4f(
        a.w*b.x + a.x*b.w + a.y*b.z - a.z*b.y,
        a.w*b.y - a.x*b.z + a.y*b.w + a.z*b.x,
        a.w*b.z + a.x*b.y - a.y*b.x + a.z*b.w,
        a.w*b.w - a.x*b.x - a.y*b.y - a.z*b.z,
    );
}

// Roda v por q: v' = q ⊗ [v,0] ⊗ q⁻¹  (forma expandida sem quat extra)
fn quat_rotate_vec(q: vec4f, v: vec3f) -> vec3f {
    let t = 2.0 * cross(q.xyz, v);
    return v + q.w * t + cross(q.xyz, t);
}

// Roda v pela rotação inversa de q (conjugado): útil para world→local
fn quat_rotate_vec_inv(q: vec4f, v: vec3f) -> vec3f {
    let t = 2.0 * cross(q.xyz, v);
    return v - q.w * t + cross(q.xyz, t);
}

// Integração de orientação: q' = normalize(q + 0.5 · (ω⊗q) · dt)
// Replica QuaternionUtils.integrateOmega usado em IntegrationStage.
fn quat_integrate(q: vec4f, omega: vec3f, dt: f32) -> vec4f {
    let h = 0.5 * dt;
    let dq = vec4f(
         h * ( omega.x*q.w + omega.y*q.z - omega.z*q.y),
         h * (-omega.x*q.z + omega.y*q.w + omega.z*q.x),
         h * ( omega.x*q.y - omega.y*q.x + omega.z*q.w),
         h * (-omega.x*q.x - omega.y*q.y - omega.z*q.z),
    );
    return quat_normalize(q + dq);
}

// Aplica um delta de rotação (vetor em world space) ao quaternion.
// Usado em constraint posicional XPBD para corpos rígidos (SolveStage).
fn quat_apply_angular_delta(q: vec4f, delta: vec3f) -> vec4f {
    let dq = vec4f(
         delta.x*q.w + delta.y*q.z - delta.z*q.y,
         delta.y*q.w + delta.z*q.x - delta.x*q.z,
         delta.z*q.w + delta.x*q.y - delta.y*q.x,
        -delta.x*q.x - delta.y*q.y - delta.z*q.z,
    );
    return quat_normalize(q + 0.5 * dq);
}

// Deriva velocidade angular a partir da variação de orientação num substep.
// Replica VelocityRecoveryStage: ω = 2·sign(Δq.w)·Δq.xyz / dt
fn quat_delta_omega(q_new: vec4f, q_old: vec4f, inv_dt: f32) -> vec3f {
    let cj = vec4f(-q_old.x, -q_old.y, -q_old.z, q_old.w);
    let dq = quat_mul(q_new, cj);
    let s  = select(-2.0 * inv_dt, 2.0 * inv_dt, dq.w >= 0.0);
    return dq.xyz * s;
}
`;
