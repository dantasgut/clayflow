// portado de legacy/elements/physics/gpu/wgsl/kernels/pbf_xsph.wgsl.ts
// Correção de velocidade do PBF (spec 005, R18): XSPH (Schechter & Bridson 2012) + confinamento de vorticidade
// (Macklin & Müller 2013) a partir de ω calculado no passe anterior. Grava Δv em `pbf_delta` (os vizinhos leem as
// velocidades deste passe, sem corrida); `pbf_apply_velocity_main` soma depois.

@compute @workgroup_size(WORKGROUP_SIZE)
fn pbf_xsph_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    // Na ordem por célula: o posto `t` (a lista e a contagem de vizinhos) e a partícula `i` dele.
    let t = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let i = neighbor_particle(t, pbf_params.particle_count);
    if (i == NONE) { return; }

    let h        = pbf_params.h;
    let eps_v    = pbf_params.vorticity_eps;  // vorticity_eps
    let c        = pbf_params.xsph_c;  // xsph_c
    let dt       = pbf_params.dt;
    let m_rho0   = pbf_params.mass_over_density;     // m / ρ₀
    let max_nb   = pbf_params.max_neighbors;
    let nb_count = neighbor_count[t];

    let xi      = particles[i].pos.xyz;
    let vi      = particles[i].vel.xyz;
    let omega_i = particles[i].curl.xyz;

    var xsph = vec3f(0.0);
    var eta  = vec3f(0.0);
    // Tensão superficial contínua (spec 034, T066e): só com σ > 0, somada ao Δv como dt · a.
    let sigma   = pbf_params.surface_tension;
    let surface = sigma > 0.0;
    var csf     = vec2f(0.0);
    var a_coh   = vec3f(0.0);
    var a_curv  = vec3f(0.0);
    var n_i     = vec4f(0.0);
    var grad_i  = vec3f(0.0);
    if (surface) {
        grad_i = pbf_normal[i].xyz - pbf_boundary[i].xyz;
        n_i = csf_normal(pbf_normal[i].xyz, pbf_boundary[i].xyz, h);
    }
    for (var k: u32 = 0u; k < nb_count && k < max_nb; k++) {
        let j    = neighbor_list[k * pbf_params.neighbor_stride + t];
        let dv   = xi - particles[j].pos.xyz;
        let r_sq = dot(dv, dv);
        xsph += (particles[j].vel.xyz - vi) * W_poly6(r_sq, h);
        eta  += length(particles[j].curl.xyz) * grad_W_spiky(dv, sqrt(r_sq), h);
        if (surface && r_sq > 1e-12) {
            let grad_j = pbf_normal[j].xyz - pbf_boundary[j].xyz;
            if (n_i.w > 0.0) {
                let n_j = csf_normal(pbf_normal[j].xyz, pbf_boundary[j].xyz, h);
                csf += csf_divergence_pair(n_i, n_j, grad_W_poly6(dv, r_sq, h), sqrt(r_sq));
            }
            // Sem a densidade por partícula no PBF: a correção Kᵢⱼ com ρ₀ (1).
            let rho0 = pbf_params.rest_density;
            let gamma = pbf_params.cohesion_gamma;
            a_coh += akinci_cohesion_accel(
                dv, sqrt(r_sq), pbf_params.support, gamma, pbf_params.particle_mass, rho0, rho0, rho0,
            );
            a_curv += akinci_curvature_accel(grad_i, grad_j, pbf_params.support, gamma, rho0, rho0, rho0);
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
    if (surface) {
        // A parede como vizinha com a normal de Young (Breinlinger et al. 2013), e os regimes da tensão (a reação
        // do sólido na primeira camada, 1,3 s = 0,65 h).
        let contact = particles[i].contact;
        if (contact.w < h) {
            csf += csf_wall_pair(
                n_i, contact, poly6_half_space(contact.w, h), csf_wall_support(contact.w, h, true),
                pbf_params.wet_cos, m_rho0,
            );
        }
        dvel += dt * fluid_surface_accel(
            n_i, csf, a_coh, a_curv, contact, m_rho0, sigma, h, pbf_params.support, 0.65 * h,
            pbf_params.adhesion_accel,
        );
    }
    pbf_delta[i] = vec4f(dvel, 0.0);
}
