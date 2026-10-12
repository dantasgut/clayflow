// portado de legacy/elements/physics/gpu/wgsl/kernels/pbf_xsph.wgsl.ts
// Correção de velocidade do PBF (spec 005, R18): XSPH (Schechter & Bridson 2012) + confinamento de vorticidade
// (Macklin & Müller 2013) a partir de ω calculado no passe anterior. Grava Δv em `pbf_delta` (os vizinhos leem as
// velocidades deste passe, sem corrida); `pbf_apply_velocity_main` soma depois.
@group(0) @binding(0) var<uniform>             pbf_params:     PBFSimParams;
@group(1) @binding(0) var<storage, read_write> particles:      array<PBFParticle>;
@group(2) @binding(0) var<storage, read>       neighbor_list:  array<u32>;
@group(2) @binding(1) var<storage, read>       neighbor_count: array<u32>;
@group(3) @binding(0) var<storage, read_write> pbf_delta:      array<vec4f>;

@compute @workgroup_size(64)
fn pbf_xsph_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    let i = gid3.x + gid3.y * nwg.x * 64u;
    if (i >= pbf_params.particle_count) { return; }

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
    for (var k: u32 = 0u; k < nb_count && k < max_nb; k++) {
        let j    = neighbor_list[i * max_nb + k];
        let dv   = xi - particles[j].pos.xyz;
        let r_sq = dot(dv, dv);
        xsph += (particles[j].vel.xyz - vi) * W_poly6(r_sq, h);
        eta  += length(particles[j].curl.xyz) * grad_W_spiky(dv, sqrt(r_sq), h);
    }
    // η = ∇|ω| = Σ (m/ρ₀) |ωⱼ| ∇W; N = η/|η|; f = ε (N × ωᵢ).
    eta *= m_rho0;
    var f_vort = vec3f(0.0);
    let eta_len = length(eta);
    if (eta_len > 0.0001) {
        f_vort = eps_v * cross(eta / eta_len, omega_i);
    }
    pbf_delta[i] = vec4f(c * m_rho0 * xsph + dt * f_vort, 0.0);
}
