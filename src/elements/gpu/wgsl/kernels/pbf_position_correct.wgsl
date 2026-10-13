// portado de legacy/elements/physics/gpu/wgsl/kernels/pbf_position_correct.wgsl.ts
@group(0) @binding(0) var<uniform>             pbf_params:     PBFSimParams;
@group(1) @binding(0) var<storage, read_write> particles:      array<PBFParticle>;
@group(1) @binding(1) var<storage, read>       live: array<u32>;  // slots vivos do pool (spec 008)
@group(2) @binding(0) var<storage, read>       neighbor_list:  array<u32>;
@group(2) @binding(1) var<storage, read>       neighbor_count: array<u32>;
// Correção Δp da iteração (separada da posição: os vizinhos leem as posições desta iteração, sem corrida).
@group(3) @binding(0) var<storage, read_write> pbf_delta:      array<vec4f>;

@compute @workgroup_size(64)
fn pbf_position_correct_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    let gid = vec3u(gid3.x + gid3.y * nwg.x * 64u, 0u, 0u);
    let i = gid.x;
    if (i >= pbf_params.particle_count || !pool_live(live[i >> 5u], i)) { return; }

    let h       = pbf_params.h;
    let k_corr  = pbf_params.s_corr_k;            // s_corr_k
    let n_corr  = pbf_params.s_corr_n;           // s_corr_n (f32)
    let max_nb  = pbf_params.max_neighbors;
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

    delta *= pbf_params.mass_over_density;   // m / ρ₀ (Macklin & Müller 2013 com massa)
    pbf_delta[i] = vec4f(delta, 0.0);
}
