/**
 * Kernel WGSL: pbf_xsph — viscosidade XSPH (suavização de velocidade).
 *
 * Para cada partícula i:
 *   vel[i] += c · Σⱼ (vⱼ − vᵢ) · W(|xᵢ−xⱼ|, h)
 *
 * Produz movimento mais coerente sem resolver equações de viscosidade explícitas.
 *
 * Bind groups:
 *   @group(0) @binding(0) — PBFSimParams (uniform)
 *   @group(1) @binding(0) — particles: array<PBFParticle> (read_write)
 *   @group(2) @binding(0) — neighbor_list:  array<u32>
 *   @group(2) @binding(1) — neighbor_count: array<u32>
 *
 * Dispatch: ceil(particle_count / 64)
 */
export const WGSL_KERNEL_PBF_XSPH = /* wgsl */`

@group(0) @binding(0) var<uniform>             pbf_params:     PBFSimParams;
@group(1) @binding(0) var<storage, read_write> particles:      array<PBFParticle>;
@group(2) @binding(0) var<storage, read>       neighbor_list:  array<u32>;
@group(2) @binding(1) var<storage, read>       neighbor_count: array<u32>;

fn W_poly6(r_sq: f32, h: f32) -> f32 {
    let h_sq = h * h;
    if (r_sq >= h_sq) { return 0.0; }
    let d = h_sq - r_sq;
    let coeff = 315.0 / (64.0 * 3.14159265 * pow(h, 9.0));
    return coeff * d * d * d;
}

@compute @workgroup_size(64)
fn pbf_xsph_main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= pbf_params.counts.x) { return; }

    let h        = pbf_params.config.y;
    let c        = pbf_params.config2.z;  // xsph_c
    let max_nb   = pbf_params.counts.z;
    let nb_count = neighbor_count[i];
    let xi       = particles[i].pos.xyz;
    let vi       = particles[i].vel.xyz;

    var delta_v = vec3f(0.0);

    for (var k: u32 = 0u; k < nb_count && k < max_nb; k++) {
        let j    = neighbor_list[i * max_nb + k];
        let xj   = particles[j].pos.xyz;
        let vj   = particles[j].vel.xyz;
        let dv   = xi - xj;
        let r_sq = dot(dv, dv);
        delta_v += (vj - vi) * W_poly6(r_sq, h);
    }

    particles[i].vel = vec4f(vi + c * delta_v, 0.0);
}
`;
