// portado de legacy/elements/physics/gpu/wgsl/kernels/pbf_vorticity.wgsl.ts

@compute @workgroup_size(WORKGROUP_SIZE)
fn pbf_vorticity_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    // Na ordem por célula: o posto `t` (a lista e a contagem de vizinhos) e a partícula `i` dele.
    let t = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    let i = neighbor_particle(t, pbf_params.particle_count);
    if (i == NONE) { return; }

    let h        = pbf_params.h;
    let max_nb   = pbf_params.max_neighbors;
    let nb_count = neighbor_count[t];
    let xi  = particles[i].pos.xyz;
    let vi  = particles[i].vel.xyz;

    // Passo 1: computa ωᵢ = Σ vᵢⱼ × ∇W
    var omega = vec3f(0.0);

    for (var k: u32 = 0u; k < nb_count && k < max_nb; k++) {
        let j  = neighbor_list[k * pbf_params.neighbor_stride + t];
        let xj = particles[j].pos.xyz;
        let vj = particles[j].vel.xyz;
        let dv = xi - xj;
        let r  = length(dv);
        let gw = grad_W_spiky(dv, r, h);
        let vij = vj - vi;  // vᵢⱼ = vⱼ − vᵢ  (convenção PBF 2013)
        omega += pbf_params.mass_over_density * cross(vij, gw);   // ω = Σ (m/ρ₀) vᵢⱼ × ∇W
    }

    // Passo 2: ηᵢ = Σⱼ ‖ωⱼ‖ · ∇W  (lendo curl armazenado do frame anterior — ok para 1ª iteração = 0)
    // Só ω: a força de confinamento lê |ωⱼ| dos vizinhos e é aplicada no passe seguinte (junto do XSPH). O `w` é o
    // estado da gota solta que a velocidade deixou (`fluid_drop_state`, T066d): o campo dos fluidos o lê depois do passo.
    particles[i].curl = vec4f(omega, particles[i].curl.w);

    // Tensão superficial (spec 030; contínua, spec 034 T066e): o gradiente da cor do fluido no poly6 (o núcleo da
    // fronteira, que o XSPH soma a ele para as normais da tensão contínua e de Akinci), lido pelos vizinhos no passe do
    // XSPH. Só com σ > 0.
    if (pbf_params.surface_tension > 0.0) {
        var n = vec3f(0.0);
        for (var k: u32 = 0u; k < nb_count && k < max_nb; k++) {
            let j  = neighbor_list[k * pbf_params.neighbor_stride + t];
            let dv = xi - particles[j].pos.xyz;
            n += grad_W_poly6(dv, dot(dv, dv), h);
        }
        pbf_normal[i] = vec4f(pbf_params.mass_over_density * n, 0.0);
    }
}
