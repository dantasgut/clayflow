// portado de legacy/elements/physics/gpu/wgsl/kernels/pbf_vorticity.wgsl.ts

@compute @workgroup_size(WORKGROUP_SIZE)
fn pbf_vorticity_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Na ordem por célula da vizinhança (spec 034): os fios de um grupo são partículas vizinhas e leem os mesmos vizinhos.
    let t = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (t >= ns_order[arrayLength(&ns_order) - 1u]) { return; }
    let i = ns_order[t];
    if (!pool_live(live[i >> 5u], i)) { return; }

    let h        = pbf_params.h;
    let max_nb   = pbf_params.max_neighbors;
    let nb_count = neighbor_count[i];
    let xi  = particles[i].pos.xyz;
    let vi  = particles[i].vel.xyz;

    // Passo 1: computa ωᵢ = Σ vᵢⱼ × ∇W
    var omega = vec3f(0.0);

    for (var k: u32 = 0u; k < nb_count && k < max_nb; k++) {
        let j  = neighbor_list[k * pbf_params.neighbor_stride + i];
        let xj = particles[j].pos.xyz;
        let vj = particles[j].vel.xyz;
        let dv = xi - xj;
        let r  = length(dv);
        let gw = grad_W_spiky(dv, r, h);
        let vij = vj - vi;  // vᵢⱼ = vⱼ − vᵢ  (convenção PBF 2013)
        omega += pbf_params.mass_over_density * cross(vij, gw);   // ω = Σ (m/ρ₀) vᵢⱼ × ∇W
    }

    // Passo 2: ηᵢ = Σⱼ ‖ωⱼ‖ · ∇W  (lendo curl armazenado do frame anterior — ok para 1ª iteração = 0)
    // Só ω: a força de confinamento lê |ωⱼ| dos vizinhos e é aplicada no passe seguinte (junto do XSPH).
    particles[i].curl = vec4f(omega, 0.0);

    // Tensão superficial de Akinci (spec 030): normal nᵢ = H Σ (m/ρ₀) ∇W e densidade ρᵢ = m Σ W (poly6), lidas pelos
    // vizinhos no passe do XSPH. Só com coesão > 0.
    if (pbf_params.cohesion_gamma > 0.0) {
        var n   = vec3f(0.0);
        var rho = pbf_params.particle_mass * W_poly6(0.0, h);
        for (var k: u32 = 0u; k < nb_count && k < max_nb; k++) {
            let j  = neighbor_list[k * pbf_params.neighbor_stride + i];
            let dv = xi - particles[j].pos.xyz;
            let r  = length(dv);
            n   += pbf_params.mass_over_density * grad_W_spiky(dv, r, h);
            rho += pbf_params.particle_mass * W_poly6(r * r, h);
        }
        pbf_normal[i] = vec4f(pbf_params.support * n, rho);
    }
}
