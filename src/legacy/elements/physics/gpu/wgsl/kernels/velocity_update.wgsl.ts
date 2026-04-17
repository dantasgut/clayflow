/**
 * Kernel WGSL: VelocityUpdate — deriva velocidade e commita posição (XPBD Fase final).
 *
 * Replica SoftBodyVelocityUpdateStage + SoftBodyPositionCommitStage na GPU:
 *   vel   = (pred - pos) / dt · dampFactor    (velocidade derivada do deslocamento real)
 *   vel   = clamp(vel, ±30 m/s)               (evita explosão por correções de colisão profunda)
 *   pos   = pred                               (commit: posição prevista → posição atual)
 *
 * dampFactor = max(0, 1 - damping · dt)  equivalente ao CPU.
 * O fator de amortecimento é escalado por dt (independente do número de substeps):
 *   damping=0.02 → ~2% de perda por segundo.
 *
 * Partículas fixadas (pos.w = 0) são ignoradas.
 *
 * Bind groups:
 *   @group(0) @binding(0) — SimParams  (uniform)
 *   @group(0) @binding(1) — Particle[] (storage read_write)
 *
 * Dispatch: ceil(particle_count / 64) workgroups.
 *
 * Depende de: SimParams, Particle.
 */
export const WGSL_KERNEL_VELOCITY_UPDATE = /* wgsl */`

@group(0) @binding(0) var<uniform>             params:    SimParams;
@group(0) @binding(1) var<storage, read_write> particles: array<Particle>;

const MAX_SPEED: f32 = 30.0;   // m/s — clamp contra explosão de velocidade

@compute @workgroup_size(64)
fn velocity_update_main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= params.particle_count) { return; }

    let inv_mass = particles[i].pos.w;
    if (inv_mass == 0.0) { return; }  // partícula fixada — ignora

    // v = (pred - pos) / dt  (derivada de posição via deslocamento real)
    let inv_dt     = 1.0 / params.dt;
    let damp       = max(0.0, 1.0 - params.damping * params.dt);  // replicao CPU
    var vel        = (particles[i].pred.xyz - particles[i].pos.xyz) * inv_dt * damp;

    // Clamp de velocidade (replica SoftBodyVelocityUpdateStage — evita explosão por colisão profunda)
    let speed2 = dot(vel, vel);
    if (speed2 > MAX_SPEED * MAX_SPEED) {
        vel = vel * (MAX_SPEED / sqrt(speed2));
    }

    // Commit: posição prevista torna-se posição atual (replica SoftBodyPositionCommitStage)
    particles[i].vel = vec4f(vel, particles[i].vel.w);
    particles[i].pos = vec4f(particles[i].pred.xyz, particles[i].pos.w);  // preserva invMass em w
}
`;
