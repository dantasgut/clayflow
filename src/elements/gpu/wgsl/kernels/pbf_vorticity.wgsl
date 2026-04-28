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
fn pbf_vorticity_main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= pbf_params.counts.x) { return; }

    let h        = pbf_params.config.y;
    let eps_v    = pbf_params.config2.y;
    let dt       = pbf_params.gravity_dt.w;
    let max_nb   = pbf_params.counts.z;
    let nb_count = neighbor_count[i];
    let xi  = particles[i].pos.xyz;
    let vi  = particles[i].vel.xyz;

    // Passo 1: computa ωᵢ = Σ vᵢⱼ × ∇W
    var omega = vec3f(0.0);
    var eta   = vec3f(0.0);

    for (var k: u32 = 0u; k < nb_count && k < max_nb; k++) {
        let j  = neighbor_list[i * max_nb + k];
        let xj = particles[j].pos.xyz;
        let vj = particles[j].vel.xyz;
        let dv = xi - xj;
        let r  = length(dv);
        let gw = grad_W_spiky(dv, r, h);
        let vij = vj - vi;  // vᵢⱼ = vⱼ − vᵢ  (convenção PBF 2013)
        omega += cross(vij, gw);
    }

    // Passo 2: ηᵢ = Σⱼ ‖ωⱼ‖ · ∇W  (lendo curl armazenado do frame anterior — ok para 1ª iteração = 0)
    for (var k: u32 = 0u; k < nb_count && k < max_nb; k++) {
        let j  = neighbor_list[i * max_nb + k];
        let xj = particles[j].pos.xyz;
        let dv = xi - xj;
        let r  = length(dv);
        let gw = grad_W_spiky(dv, r, h);
        let omega_j_mag = length(particles[j].curl.xyz);
        eta += omega_j_mag * gw;
    }

    let eta_len = length(eta);
    var f_vort = vec3f(0.0);
    if (eta_len > 0.0001) {
        let N = eta / eta_len;
        f_vort = eps_v * cross(N, omega);
    }

    // Aplica força + salva curl
    particles[i].vel    = vec4f(vi + dt * f_vort, 0.0);
    particles[i].curl   = vec4f(omega, 0.0);
}
