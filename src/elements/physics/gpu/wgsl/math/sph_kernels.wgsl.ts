/**
 * SPH Kernels — Cubic Spline W₃ (C² contínuo, suporte compacto 2h).
 *
 * W(r, h) = σ₃ · f(q),   q = r/h,   σ₃ = 1/(π·h³)
 *
 *   f(q) = (1 - 1.5q² + 0.75q³)          se 0 ≤ q < 1
 *          0.25·(2 - q)³                   se 1 ≤ q < 2
 *          0                               se q ≥ 2
 *
 * dW/dr(r, h) = (σ₃/h) · f'(q)/h
 *
 *   f'(q) = q·(-3 + 2.25q)               se 0 ≤ q < 1
 *           -0.75·(2-q)²                  se 1 ≤ q < 2
 *           0                             se q ≥ 2
 *
 * ∇W(xᵢ − xⱼ, h) = dW/dr(r, h) · (xᵢ − xⱼ) / r
 */
export const WGSL_SPH_KERNELS = /* wgsl */`

// Cubic Spline W₃(r, h): valor escalar
fn W_cubic(r: f32, h: f32) -> f32 {
    let q     = r / h;
    let sigma = 1.0 / (3.14159265 * h * h * h);
    if (q < 1.0) {
        return sigma * (1.0 - 1.5*q*q + 0.75*q*q*q);
    } else if (q < 2.0) {
        let d = 2.0 - q;
        return sigma * 0.25 * d * d * d;
    }
    return 0.0;
}

// Gradiente ∇W₃(r_vec, r, h): vetor 3D
fn grad_W_cubic(r_vec: vec3f, r: f32, h: f32) -> vec3f {
    if (r < 0.0001 || r >= 2.0 * h) { return vec3f(0.0); }
    let q     = r / h;
    let sigma = 1.0 / (3.14159265 * h * h * h);
    var dq: f32;
    if (q < 1.0) {
        dq = sigma * (-3.0*q + 2.25*q*q) / h;
    } else {
        let d = 2.0 - q;
        dq = sigma * (-0.75 * d * d) / h;
    }
    return dq * r_vec / r;
}
`;
