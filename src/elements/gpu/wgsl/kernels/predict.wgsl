// portado de legacy/elements/physics/gpu/wgsl/kernels/predict.wgsl.ts
@group(0) @binding(0) var<uniform>             params:    SimParams;
@group(0) @binding(1) var<storage, read_write> particles: array<Particle>;

@compute @workgroup_size(64)
fn predict_main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= params.particle_count) { return; }

    let inv_mass = particles[i].pos.w;
    if (inv_mass == 0.0) { return; }  // partícula fixada — ignora

    // 1. Integra gravidade → velocidade (replica XPBDSoftBodySolver)
    let vel = particles[i].vel.xyz + params.gravity * params.dt;

    // 2. Predição de posição (replica SoftBodyPredictStage)
    let pred = particles[i].pos.xyz + vel * params.dt;

    particles[i].vel  = vec4f(vel,  particles[i].vel.w);
    particles[i].pred = vec4f(pred, particles[i].pred.w);
}
