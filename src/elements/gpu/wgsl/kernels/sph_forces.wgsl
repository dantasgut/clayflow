// portado de legacy/elements/physics/gpu/wgsl/kernels/sph_forces.wgsl.ts
@group(0) @binding(0) var<uniform>             sph_params:     SPHSimParams;
@group(1) @binding(0) var<storage, read_write> particles:      array<SPHParticle>;
@group(2) @binding(0) var<storage, read>       neighbor_list:  array<u32>;
@group(2) @binding(1) var<storage, read>       neighbor_count: array<u32>;

@compute @workgroup_size(64)
fn sph_forces_main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= sph_params.counts.x) { return; }

    let h      = sph_params.fluid.y;
    let mu     = sph_params.viscosity.x;
    let xsph_c = sph_params.viscosity.y;
    let mass   = sph_params.mass.x;
    let max_nb = sph_params.counts.z;
    let nb_n   = neighbor_count[i];
    let g      = sph_params.gravity_dt.xyz;

    let xi   = particles[i].pos.xyz;
    let vi   = particles[i].vel.xyz;
    let rho_i = particles[i].pos.w;
    let p_i   = particles[i].vel.w;

    var f_press  = vec3f(0.0);
    var f_visc   = vec3f(0.0);
    var xsph_acc = vec3f(0.0);

    for (var k: u32 = 0u; k < nb_n && k < max_nb; k++) {
        let j    = neighbor_list[i * max_nb + k];
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
    }

    // Aceleração total = g + f_press + f_visc (força / massa = aceleração)
    let accel = g + f_press + f_visc;

    particles[i].force = vec4f(accel, 0.0);
    particles[i].color = vec4f(xsph_c * xsph_acc, 0.0);
}
