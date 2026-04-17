/**
 * Kernel WGSL: fem_velocity_update — deriva velocidade das posições corrigidas e avança estado.
 *
 * Executa 1× por substep, APÓS todos os kernels de solve e colisão.
 *
 * Para cada nó dinâmico (inv_mass > 0):
 *   1. Deriva velocidade XPBD: vel = (pred - pos) / dt
 *   2. Aplica damping:         vel *= (1 - damping)
 *   3. Atualiza posição:       pos = pred
 *
 * Nós fixos (invMass == 0) são ignorados.
 *
 * Bind groups:
 *   @group(0) @binding(0) — FEMSimParams (uniform)
 *   @group(0) @binding(1) — Particle[]   (storage read_write)
 *
 * Dispatch: ceil(node_count / 64) workgroups.
 *
 * Depende de: FEMSimParams, Particle.
 */
export const WGSL_KERNEL_FEM_VELOCITY_UPDATE = /* wgsl */`

@group(0) @binding(0) var<uniform>             fem_params: FEMSimParams;
@group(0) @binding(1) var<storage, read_write> nodes:      array<Particle>;

@compute @workgroup_size(64)
fn fem_velocity_update_main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= fem_params.node_count) { return; }

    let inv_mass = nodes[i].pos.w;
    if (inv_mass == 0.0) { return; }

    let dt = fem_params.dt_sub;
    if (dt < 1e-12) { return; }

    let pos  = nodes[i].pos.xyz;
    let pred = nodes[i].pred.xyz;

    var vel = (pred - pos) / dt;
    vel *= max(1.0 - fem_params.damping, 0.0);

    nodes[i].vel = vec4f(vel, nodes[i].vel.w);
    nodes[i].pos = vec4f(pred, nodes[i].pos.w);
}
`;
