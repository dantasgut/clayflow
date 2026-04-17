/**
 * Kernel WGSL: Predict — integra forças e calcula posição prevista (XPBD Fase 1).
 *
 * Replica XPBDSoftBodySolver.solve() + SoftBodyPredictStage.predictBodies() na GPU:
 *   vel  += gravity · dt          (integração de força — uniform gravity em SimParams)
 *   pred  = pos + vel · dt        (predição de posição Euler explícito)
 *
 * Partículas fixadas (pos.w = invMass = 0.0) são ignoradas.
 *
 * Bind groups:
 *   @group(0) @binding(0) — SimParams (uniform)
 *   @group(0) @binding(1) — Particle[] (storage read_write)
 *
 * Dispatch: ceil(particle_count / 64) workgroups.
 *
 * Depende de: SimParams, Particle.
 */
export const WGSL_KERNEL_PREDICT = /* wgsl */`

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
`;
