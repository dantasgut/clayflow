// portado de legacy/elements/physics/gpu/wgsl/kernels/pbf_vorticity.wgsl.ts
@group(0) @binding(0) var<uniform>             pbf_params:     PBFSimParams;
@group(1) @binding(0) var<storage, read_write> particles:      array<PBFParticle>;
@group(2) @binding(0) var<storage, read>       neighbor_list:  array<u32>;
@group(2) @binding(1) var<storage, read>       neighbor_count: array<u32>;

fn grad_W_spiky(r_vec: vec3f, r: f32, h: f32) -> vec3f {
    if (r <= 0.0001 || r >= h) { return vec3f(0.0); }
    let coeff = -45.0 / (3.14159265 * pow(h, 6.0));
    let d = h - r;
    return coeff * (d * d / r) * r_vec;
}

@compute @workgroup_size(64)
fn pbf_vorticity_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    let gid = vec3u(gid3.x + gid3.y * nwg.x * 64u, 0u, 0u);
    let i = gid.x;
    if (i >= pbf_params.particle_count) { return; }

    let h        = pbf_params.h;
    let max_nb   = pbf_params.max_neighbors;
    let nb_count = neighbor_count[i];
    let xi  = particles[i].pos.xyz;
    let vi  = particles[i].vel.xyz;

    // Passo 1: computa ωᵢ = Σ vᵢⱼ × ∇W
    var omega = vec3f(0.0);

    for (var k: u32 = 0u; k < nb_count && k < max_nb; k++) {
        let j  = neighbor_list[i * max_nb + k];
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
}
