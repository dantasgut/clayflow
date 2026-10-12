// portado de legacy/elements/physics/gpu/wgsl/kernels/pbf_density_lambda.wgsl.ts
@group(0) @binding(0) var<uniform>             pbf_params:     PBFSimParams;
@group(1) @binding(0) var<storage, read_write> particles:      array<PBFParticle>;
@group(2) @binding(0) var<storage, read>       neighbor_list:  array<u32>;
@group(2) @binding(1) var<storage, read>       neighbor_count: array<u32>;

@compute @workgroup_size(64)
fn pbf_density_lambda_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    let gid = vec3u(gid3.x + gid3.y * nwg.x * 64u, 0u, 0u);
    let i = gid.x;
    if (i >= pbf_params.particle_count) { return; }

    let h        = pbf_params.h;
    let rho0     = pbf_params.rest_density;
    let epsilon  = pbf_params.relaxation;
    let max_nb   = pbf_params.max_neighbors;
    let nb_count = neighbor_count[i];
    let xi       = particles[i].pos.xyz;

    // Densidade
    let mass     = pbf_params.particle_mass;
    let m_rho0   = pbf_params.mass_over_density;   // m / ρ₀
    var rho = mass * W_poly6(0.0, h);  // auto-contribuição (r=0)
    var sum_grad_sq = 0.0;
    var grad_i = vec3f(0.0);

    for (var k: u32 = 0u; k < nb_count && k < max_nb; k++) {
        let j   = neighbor_list[i * max_nb + k];
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
    // Contribuição de i (∇_{xi} C_i) — adicionada UMA vez fora do loop
    sum_grad_sq += dot(grad_i, grad_i);

    // Restrição unilateral: só resiste a compressão (na superfície livre ρ < ρ₀ atrairia partículas e aglomeraria).
    let C = max(rho / rho0 - 1.0, 0.0);
    let lambda = -C / (sum_grad_sq + epsilon);

    // Escreve λ em pos.w
    particles[i].pos.w = lambda;
}
