// portado de legacy/elements/physics/gpu/wgsl/kernels/pbf_position_correct.wgsl.ts
// Correção Δp da iteração (separada da posição: os vizinhos leem as posições desta iteração, sem corrida).

@compute @workgroup_size(WORKGROUP_SIZE)
fn pbf_position_correct_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    // Na ordem por célula: o posto `t` (a lista e a contagem de vizinhos) e a partícula `i` dele.
    let t = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let i = neighbor_particle(t, pbf_params.particle_count);
    if (i == NONE) { return; }

    let h       = pbf_params.h;
    let k_corr  = pbf_params.s_corr_k;            // s_corr_k
    let n_corr  = pbf_params.s_corr_n;           // s_corr_n (f32)
    let max_nb  = pbf_params.max_neighbors;
    let nb_count = neighbor_count[t];
    let xi      = particles[i].pos.xyz;
    let li      = particles[i].pos.w;             // lambda_i

    // Ponto de referência Δq = 0.2h para s_corr
    let dq      = 0.2 * h;
    let W_dq    = W_poly6(dq * dq, h);

    var delta = vec3f(0.0);

    for (var k: u32 = 0u; k < nb_count && k < max_nb; k++) {
        let j    = neighbor_list[k * pbf_params.neighbor_stride + t];
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

    delta *= pbf_params.mass_over_density;   // m / ρ₀ (Macklin & Müller 2013 com massa)
    // Fronteira sólida (spec 034): λ_i pelo gradiente do volume do núcleo nos sólidos — empurra para fora deles.
    delta -= li * pbf_boundary[i].xyz;
    pbf_delta[i] = vec4f(delta, 0.0);
}
