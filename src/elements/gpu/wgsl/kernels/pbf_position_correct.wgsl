// portado de legacy/elements/physics/gpu/wgsl/kernels/pbf_position_correct.wgsl.ts
@group(0) @binding(0) var<uniform>             pbf_params:     PBFSimParams;
@group(1) @binding(0) var<storage, read_write> particles:      array<PBFParticle>;
@group(2) @binding(0) var<storage, read>       neighbor_list:  array<u32>;
@group(2) @binding(1) var<storage, read>       neighbor_count: array<u32>;

fn W_poly6(r_sq: f32, h: f32) -> f32 {
    let h_sq = h * h;
    if (r_sq >= h_sq) { return 0.0; }
    let d = h_sq - r_sq;
    let coeff = 315.0 / (64.0 * 3.14159265 * pow(h, 9.0));
    return coeff * d * d * d;
}

fn grad_W_spiky(r_vec: vec3f, r: f32, h: f32) -> vec3f {
    if (r <= 0.0001 || r >= h) { return vec3f(0.0); }
    let coeff = -45.0 / (3.14159265 * pow(h, 6.0));
    let d = h - r;
    return coeff * (d * d / r) * r_vec;
}

@compute @workgroup_size(64)
fn pbf_position_correct_main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= pbf_params.counts.x) { return; }

    let h       = pbf_params.config.y;
    let rho0    = pbf_params.config.x;
    let k_corr  = pbf_params.config.w;            // s_corr_k
    let n_corr  = f32(pbf_params.config2.x);      // s_corr_n (cast u32→f32 no WGSL via bitcast u32)
    let max_nb  = pbf_params.counts.z;
    let nb_count = neighbor_count[i];
    let xi      = particles[i].pos.xyz;
    let li      = particles[i].pos.w;             // lambda_i

    // Ponto de referência Δq = 0.2h para s_corr
    let dq      = 0.2 * h;
    let W_dq    = W_poly6(dq * dq, h);

    var delta = vec3f(0.0);

    for (var k: u32 = 0u; k < nb_count && k < max_nb; k++) {
        let j    = neighbor_list[i * max_nb + k];
        let xj   = particles[j].pos.xyz;
        let lj   = particles[j].pos.w;
        let dv   = xi - xj;
        let r_sq = dot(dv, dv);
        let r    = sqrt(r_sq);

        // s_corr: anti-tensile instability
        var s_corr = 0.0;
        if (W_dq > 0.0) {
            let ratio = W_poly6(r_sq, h) / W_dq;
            s_corr = -k_corr * pow(ratio, n_corr);
        }

        let gw = grad_W_spiky(dv, r, h);
        delta += (li + lj + s_corr) * gw;
    }

    delta /= rho0;
    particles[i].pos = vec4f(xi + delta, li);
}
