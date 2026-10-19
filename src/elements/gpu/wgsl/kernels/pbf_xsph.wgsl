// portado de legacy/elements/physics/gpu/wgsl/kernels/pbf_xsph.wgsl.ts
// Correção de velocidade do PBF (spec 005, R18): XSPH (Schechter & Bridson 2012) + confinamento de vorticidade
// (Macklin & Müller 2013) a partir de ω calculado no passe anterior. Grava Δv em `pbf_delta` (os vizinhos leem as
// velocidades deste passe, sem corrida); `pbf_apply_velocity_main` soma depois.

@compute @workgroup_size(WORKGROUP_SIZE)
fn pbf_xsph_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Na ordem por célula da vizinhança (spec 034): os fios de um grupo são partículas vizinhas e leem os mesmos vizinhos.
    let t = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (t >= ns_order[arrayLength(&ns_order) - 1u]) { return; }
    let i = ns_order[t];
    if (!pool_live(live[i >> 5u], i)) { return; }

    let h        = pbf_params.h;
    let eps_v    = pbf_params.vorticity_eps;  // vorticity_eps
    let c        = pbf_params.xsph_c;  // xsph_c
    let dt       = pbf_params.dt;
    let m_rho0   = pbf_params.mass_over_density;     // m / ρ₀
    let max_nb   = pbf_params.max_neighbors;
    let nb_count = neighbor_count[i];

    let xi      = particles[i].pos.xyz;
    let vi      = particles[i].vel.xyz;
    let omega_i = particles[i].curl.xyz;

    var xsph = vec3f(0.0);
    var eta  = vec3f(0.0);
    // Tensão superficial de Akinci (spec 030): só com coesão > 0, somada ao Δv como dt · a.
    let gamma   = pbf_params.cohesion_gamma;
    let surface = gamma > 0.0;
    var a_st    = vec3f(0.0);
    var self_n  = vec4f(0.0);
    if (surface) { self_n = pbf_normal[i]; }
    for (var k: u32 = 0u; k < nb_count && k < max_nb; k++) {
        let j    = neighbor_list[k * pbf_params.neighbor_stride + i];
        let dv   = xi - particles[j].pos.xyz;
        let r_sq = dot(dv, dv);
        xsph += (particles[j].vel.xyz - vi) * W_poly6(r_sq, h);
        eta  += length(particles[j].curl.xyz) * grad_W_spiky(dv, sqrt(r_sq), h);
        if (surface && r_sq > 1e-12) {
            let nj = pbf_normal[j];
            a_st += akinci_pair_accel(
                dv, sqrt(r_sq), pbf_params.support, gamma, pbf_params.particle_mass,
                pbf_params.rest_density, self_n.w, nj.w, self_n.xyz, nj.xyz,
            );
        }
    }
    // η = ∇|ω| = Σ (m/ρ₀) |ωⱼ| ∇W; N = η/|η|; f = ε (N × ωᵢ).
    eta *= m_rho0;
    var f_vort = vec3f(0.0);
    let eta_len = length(eta);
    if (eta_len > 0.0001) {
        f_vort = eps_v * cross(eta / eta_len, omega_i);
    }
    var dvel = c * m_rho0 * xsph + dt * f_vort;
    if (surface) { dvel += dt * a_st; }
    pbf_delta[i] = vec4f(dvel, 0.0);
}
