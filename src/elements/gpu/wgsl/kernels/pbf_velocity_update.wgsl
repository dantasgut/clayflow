// portado de legacy/elements/physics/gpu/wgsl/kernels/pbf_velocity_update.wgsl.ts
@group(0) @binding(0) var<uniform>             pbf_params: PBFSimParams;
@group(1) @binding(0) var<storage, read_write> particles:  array<PBFParticle>;

@compute @workgroup_size(64)
fn pbf_velocity_update_main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= pbf_params.counts.x) { return; }

    let dt      = pbf_params.gravity_dt.w;
    let inv_dt  = select(0.0, 1.0 / dt, dt > 0.00001);

    let pos_new = particles[i].pos.xyz;
    let pos_old = particles[i].posOld.xyz;

    particles[i].vel = vec4f((pos_new - pos_old) * inv_dt, 0.0);
}
