/**
 * Kernel WGSL: shape_correct — aplica correção de Shape Matching às posições previstas.
 *
 * Para cada partícula livre, puxa pred_i em direção à posição-meta g_i com
 * coeficiente `shape_stiffness` (0=sem correção, 1=posição-meta exata):
 *
 *   pred_i += shape_stiffness · (g_i − pred_i)
 *
 * Partículas fixadas (invMass = 0) são ignoradas (não movidas).
 * Executa em paralelo: ceil(particle_count / 64) workgroups.
 *
 * Bindings:
 *   @binding(0) SimParams        (uniform)            — lê particle_count, shape_stiffness
 *   @binding(1) Particle[]       (storage read_write) — modifica pred.xyz
 *   @binding(2) goal_positions[] (storage read)       — lê g_i escrito por shape_match_transform
 *
 * Requer: SimParams, Particle (structs).
 * Deve ser dispatchado APÓS shape_match_transform e ANTES de distance_solve.
 */
export const WGSL_KERNEL_SHAPE_CORRECT = /* wgsl */`

@group(0) @binding(0) var<uniform>             params:         SimParams;
@group(0) @binding(1) var<storage, read_write> particles:      array<Particle>;
@group(0) @binding(2) var<storage, read>       goal_positions: array<vec4f>;

@compute @workgroup_size(64)
fn shape_correct_main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= params.particle_count) { return; }
    if (particles[i].pos.w == 0.0) { return; }   // partícula fixada — sem correção

    let alpha = params.shape_stiffness;
    let g_i   = goal_positions[i].xyz;
    let p_i   = particles[i].pred.xyz;
    particles[i].pred = vec4f(p_i + alpha * (g_i - p_i), particles[i].pred.w);
}
`;
