// portado de legacy/elements/physics/gpu/wgsl/kernels/sph_forces.wgsl.ts
// Campos de força (spec 009): os campos prontos (pool `FieldBuiltinRecord`) e as funções `field` (pool da forma de cada
// uma, spec 031), ligados pela C2 (ponto `field`).

@compute @workgroup_size(WORKGROUP_SIZE)
fn sph_forces_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    // Na ordem por célula: o posto `t` (a lista e a contagem de vizinhos) e a partícula `i` dele.
    let t = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let i = neighbor_particle(t, sph_params.particle_count);
    if (i == NONE) { return; }

    let h      = sph_params.h;
    let mu     = sph_params.viscosity;
    let xsph_c = sph_params.xsph_c;
    let mass   = sph_params.particle_mass;
    let max_nb = sph_params.max_neighbors;
    let nb_n   = neighbor_count[t];
    let g      = sph_params.gravity;

    let xi   = particles[i].pos.xyz;
    let vi   = particles[i].vel.xyz;
    let rho_i = particles[i].pos.w;
    let p_i   = particles[i].vel.w;

    var f_press  = vec3f(0.0);
    var f_visc   = vec3f(0.0);
    var xsph_acc = vec3f(0.0);
    // Tensão superficial contínua (spec 034, T066e): só com σ > 0 — com zero, nada é lido nem somado.
    let sigma   = sph_params.surface_tension;
    let surface = sigma > 0.0;
    var csf     = vec2f(0.0);
    var a_coh   = vec3f(0.0);
    var a_curv  = vec3f(0.0);
    var n_i     = vec4f(0.0);
    var grad_i  = vec3f(0.0);
    if (surface) {
        grad_i = sph_normal[i].xyz - sph_boundary[i].xyz;
        n_i = csf_normal(sph_normal[i].xyz, sph_boundary[i].xyz, h);
    }

    for (var k: u32 = 0u; k < nb_n && k < max_nb; k++) {
        let j    = neighbor_list[k * sph_params.neighbor_stride + t];
        let xj   = particles[j].pos.xyz;
        let vj   = particles[j].vel.xyz;
        let rho_j = particles[j].pos.w;
        let p_j   = particles[j].vel.w;

        let r_vec = xi - xj;
        let r     = length(r_vec);
        if (r < 0.0001) { continue; }

        let gw = grad_W_cubic(r_vec, r, h);

        // Pressão simétrica
        var term_p = 0.0f;
        if (rho_i > 0.001 && rho_j > 0.001) {
            term_p = p_i / (rho_i * rho_i) + p_j / (rho_j * rho_j);
        }
        f_press -= mass * term_p * gw;

        // Viscosidade dinâmica (Müller 2003): ∇²W_visc sempre positivo
        let vij = vj - vi;
        let lap = laplacian_W_visc(r, h);
        if (rho_j > 0.001) {
            f_visc += mu * (mass / rho_j) * vij * lap;
        }

        // XSPH
        let w = W_cubic(r, h);
        if (rho_j > 0.001) {
            xsph_acc += (mass / rho_j) * vij * w;
        }

        if (surface) {
            let grad_j = sph_normal[j].xyz - sph_boundary[j].xyz;
            if (n_i.w > 0.0) {
                csf += csf_divergence_pair(n_i, csf_normal(sph_normal[j].xyz, sph_boundary[j].xyz, h), gw, r);
            }
            let rho0 = sph_params.rest_density;
            a_coh += akinci_cohesion_accel(
                r_vec, r, sph_params.support, sph_params.cohesion_gamma, mass, rho0, rho_i, rho_j,
            );
            a_curv += akinci_curvature_accel(
                grad_i, grad_j, sph_params.support, sph_params.cohesion_gamma, rho0, rho_i, rho_j,
            );
        }
    }

    // Aceleração total = g + pressão + viscosidade. A pressão já sai como aceleração (termo simétrico Σ m(p/ρ²)); a
    // viscosidade de Müller é força por volume (μ Σ m v_ij/ρ_j ∇²W) e precisa de ÷ρ_i — sem ela a viscosidade
    // efetiva era ρ₀ (~1000) vezes a do material e a água se comportava como mel (spec 017).
    var visc_acc = vec3f(0.0);
    if (rho_i > 0.001) { visc_acc = f_visc / rho_i; }
    // Pressão da fronteira sólida (Akinci et al. 2012): a pressão da própria partícula empurra para fora do sólido.
    if (rho_i > 0.001) {
        f_press += sph_params.rest_density * (p_i / (rho_i * rho_i)) * sph_boundary[i].xyz;
    }
    var accel = g + f_press + visc_acc;
    if (surface) {
        // A parede como vizinha com a normal de Young (Breinlinger et al. 2013), e os regimes da tensão.
        let volume  = mass / sph_params.rest_density;
        let contact = particles[i].contact;
        if (contact.w < 2.0 * h) {
            csf += csf_wall_pair(
                n_i, contact, cubic_half_space(contact.w, h), csf_wall_support(contact.w, h, false),
                sph_params.wet_cos, volume,
            );
        }
        accel += fluid_surface_accel(
            n_i, csf, a_coh, a_curv, contact, volume, sigma, h, sph_params.support, h, sph_params.adhesion_accel,
        );
    }
    // Campos (spec 009): termo à parte, só quando não são zero — sem campos, a mesma trajetória bit a bit.
    let body = FieldBody(sph_params.inv_particle_mass, sph_params.field_density, mass / sph_params.rest_density, 0.0);
    let field = field_accel(xi, vi, sph_params.field_time, body);
    if (any(field != vec3f(0.0))) { accel += field; }

    particles[i].force = vec4f(accel, 0.0);
    // `color.w`: o ancoramento da gota solta que a fronteira gravou (T066d), preservado.
    particles[i].color = vec4f(xsph_c * xsph_acc, particles[i].color.w);
}
