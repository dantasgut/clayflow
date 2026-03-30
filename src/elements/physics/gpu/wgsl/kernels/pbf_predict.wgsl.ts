/**
 * Kernel WGSL: pbf_predict — integração simplética de posição.
 *
 * Por cada partícula i:
 *   posOld = pos
 *   vel += dt * gravity
 *   pos += dt * vel     (posição tentativa x*)
 *
 * Bind groups:
 *   @group(0) @binding(0) — PBFSimParams (uniform)
 *   @group(1) @binding(0) — particles: array<PBFParticle> (read_write)
 *
 * Dispatch: ceil(particle_count / 64)
 */
export const WGSL_KERNEL_PBF_PREDICT = /* wgsl */`

@group(0) @binding(0) var<uniform>             pbf_params: PBFSimParams;
@group(1) @binding(0) var<storage, read_write> particles:  array<PBFParticle>;

@compute @workgroup_size(64)
fn pbf_predict_main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= pbf_params.counts.x) { return; }

    let dt = pbf_params.gravity_dt.w;
    let g  = pbf_params.gravity_dt.xyz;

    var p = particles[i];

    // Salva posição anterior ao substep
    p.posOld = p.pos;

    // Semi-implicit Euler: vel first, then pos
    p.vel = vec4f(p.vel.xyz + dt * g, 0.0);
    p.pos = vec4f(p.pos.xyz + dt * p.vel.xyz, p.pos.w);

    particles[i] = p;
}
`;
