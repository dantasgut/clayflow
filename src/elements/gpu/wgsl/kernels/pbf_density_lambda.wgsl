// portado de legacy/elements/physics/gpu/wgsl/kernels/pbf_density_lambda.wgsl.ts

@compute @workgroup_size(WORKGROUP_SIZE)
fn pbf_density_lambda_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    // Na ordem por célula: o posto `t` (a lista e a contagem de vizinhos) e a partícula `i` dele.
    let t = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let i = neighbor_particle(t, pbf_params.particle_count);
    if (i == NONE) { return; }

    let h        = pbf_params.h;
    let rho0     = pbf_params.rest_density;
    let epsilon  = pbf_params.relaxation;
    let max_nb   = pbf_params.max_neighbors;
    let nb_count = neighbor_count[t];
    let xi       = particles[i].pos.xyz;

    // Densidade
    let mass     = pbf_params.particle_mass;
    let m_rho0   = pbf_params.mass_over_density;   // m / ρ₀
    var rho = mass * W_poly6(0.0, h);  // auto-contribuição (r=0)
    var sum_grad_sq = 0.0;
    var grad_i = vec3f(0.0);

    for (var k: u32 = 0u; k < nb_count && k < max_nb; k++) {
        let j   = neighbor_list[k * pbf_params.neighbor_stride + t];
        let xj  = particles[j].pos.xyz;
        let dv  = xi - xj;
        let r_sq = dot(dv, dv);
        let r    = sqrt(r_sq);

        rho += mass * W_poly6(r_sq, h);

        // ∇_{xi} C_i acumula; ∇_{xj} C_i = −gw → ‖−gw‖² = ‖gw‖²
        let gw = m_rho0 * grad_W_spiky(dv, r, h);
        grad_i      += gw;
        sum_grad_sq += dot(gw, gw);   // contribuição de j (∇_{xj} C_i)
    }
    // Fronteira sólida (Akinci et al. 2012; spec 034): o sólido conta como fluido em repouso no volume do núcleo dentro
    // dele (ρ₀ Σ B), e o gradiente desse volume entra no de i (o sólido não se move: só ∇_{xi} C_i).
    let boundary = pbf_boundary[i];
    rho += rho0 * boundary.w;
    grad_i -= boundary.xyz;

    // Contribuição de i (∇_{xi} C_i) — adicionada UMA vez fora do loop
    sum_grad_sq += dot(grad_i, grad_i);

    // Restrição unilateral: só resiste a compressão (na superfície livre ρ < ρ₀ atrairia partículas e aglomeraria).
    let C = max(rho / rho0 - 1.0, 0.0);
    let lambda = -C / (sum_grad_sq + epsilon);

    // Escreve λ em pos.w
    particles[i].pos.w = lambda;
}
