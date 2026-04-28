// portado de legacy/elements/physics/gpu/wgsl/math/impulse.wgsl.ts
// ── Impulso de contato ────────────────────────────────────────────────────────

// Velocidade no ponto de contato: v_cm + ω × r
// Replica ContactImpulseKernel.vcpX/Y/Z.
fn contact_point_velocity(v_cm: vec3f, omega: vec3f, r: vec3f) -> vec3f {
    return v_cm + cross(omega, r);
}

// Correção giroscópica: Δω = -I⁻¹ · (ω × (I·ω)) · dt
// Replica GyroscopicStage / ContactImpulseKernel.gyroscopic().
// I — tensor de inércia diagonal (não invertido) no espaço local do corpo.
fn gyroscopic_correction(omega: vec3f, I: vec3f, dt: f32) -> vec3f {
    let Iw     = I * omega;
    let torque = cross(omega, Iw);
    let I_safe = max(I, vec3f(1e-6));
    return omega - (torque / I_safe) * dt;
}

// Clamp de Coulomb: |λT| ≤ μ · |λN|
// Replica ContactImpulseKernel.clampCoulombScalar().
fn coulomb_clamp(jT: f32, jN: f32, mu: f32) -> f32 {
    return min(jT, mu * abs(jN));
}

// Coeficiente de atrito combinado: √(μA·μB) se ambos > 0, max caso contrário.
// Replica ContactImpulseKernel.combineMu().
fn combine_mu(mu_a: f32, mu_b: f32) -> f32 {
    if (mu_a > 0.0 && mu_b > 0.0) { return sqrt(mu_a * mu_b); }
    return max(mu_a, mu_b);
}
