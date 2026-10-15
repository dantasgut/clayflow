// portado de legacy/elements/physics/gpu/wgsl/kernels/sph_forces.wgsl.ts
@group(0) @binding(0) var<uniform>             sph_params:     SPHSimParams;
@group(1) @binding(0) var<storage, read_write> particles:      array<SPHParticle>;
@group(1) @binding(1) var<storage, read>       live: array<u32>;  // slots vivos do pool (spec 008)
// Campos de força (spec 009): registros e slots vivos do pool `FieldFnRecord`, ligados pela C2 (ponto `field`).
@group(1) @binding(2) var<storage, read>       field_records: array<FieldFnRecord>;
@group(1) @binding(3) var<storage, read>       field_live:    array<u32>;
@group(2) @binding(0) var<storage, read>       neighbor_list:  array<u32>;
@group(2) @binding(1) var<storage, read>       neighbor_count: array<u32>;
@group(3) @binding(0) var<storage, read>       sph_normal:     array<vec4f>;  // normais (só com coesão > 0, spec 030)

@compute @workgroup_size(64)
fn sph_forces_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    let gid = vec3u(gid3.x + gid3.y * nwg.x * 64u, 0u, 0u);
    let i = gid.x;
    if (i >= sph_params.particle_count || !pool_live(live[i >> 5u], i)) { return; }

    let h      = sph_params.h;
    let mu     = sph_params.viscosity;
    let xsph_c = sph_params.xsph_c;
    let mass   = sph_params.particle_mass;
    let max_nb = sph_params.max_neighbors;
    let nb_n   = neighbor_count[i];
    let g      = sph_params.gravity;

    let xi   = particles[i].pos.xyz;
    let vi   = particles[i].vel.xyz;
    let rho_i = particles[i].pos.w;
    let p_i   = particles[i].vel.w;

    var f_press  = vec3f(0.0);
    var f_visc   = vec3f(0.0);
    var xsph_acc = vec3f(0.0);
    // Tensão superficial de Akinci (spec 030): só com coesão > 0 — com zero, nada é lido nem somado.
    let gamma   = sph_params.cohesion_gamma;
    let surface = gamma > 0.0;
    var a_st    = vec3f(0.0);
    var n_i     = vec3f(0.0);
    if (surface) { n_i = sph_normal[i].xyz; }

    for (var k: u32 = 0u; k < nb_n && k < max_nb; k++) {
        let j    = neighbor_list[k * sph_params.neighbor_stride + i];
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
            a_st += akinci_pair_accel(
                r_vec, r, sph_params.support, gamma, mass, sph_params.rest_density,
                rho_i, rho_j, n_i, sph_normal[j].xyz,
            );
        }
    }

    // Aceleração total = g + pressão + viscosidade. A pressão já sai como aceleração (termo simétrico Σ m(p/ρ²)); a
    // viscosidade de Müller é força por volume (μ Σ m v_ij/ρ_j ∇²W) e precisa de ÷ρ_i — sem ela a viscosidade
    // efetiva era ρ₀ (~1000) vezes a do material e a água se comportava como mel (spec 017).
    var visc_acc = vec3f(0.0);
    if (rho_i > 0.001) { visc_acc = f_visc / rho_i; }
    var accel = g + f_press + visc_acc;
    if (surface) { accel += a_st; }
    // Campos (spec 009): termo à parte, só quando não são zero — sem campos, a mesma trajetória bit a bit.
    let body = FieldBody(sph_params.inv_particle_mass, sph_params.field_density, mass / sph_params.rest_density, 0.0);
    let field = field_accel(xi, vi, sph_params.field_time, body);
    if (any(field != vec3f(0.0))) { accel += field; }

    particles[i].force = vec4f(accel, 0.0);
    particles[i].color = vec4f(xsph_c * xsph_acc, 0.0);
}
