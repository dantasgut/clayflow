// portado de legacy/elements/physics/gpu/wgsl/math/sph_kernels.wgsl.ts
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

// Laplaciano ∇²W_visc(r, h): escalar sempre ≥ 0 (Müller 2003)
// Suporte: r < h  (diferente do Cubic Spline que tem suporte 2h)
fn laplacian_W_visc(r: f32, h: f32) -> f32 {
    if (r >= h) { return 0.0; }
    return 45.0 / (3.14159265 * pow(h, 6.0)) * (h - r);
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
