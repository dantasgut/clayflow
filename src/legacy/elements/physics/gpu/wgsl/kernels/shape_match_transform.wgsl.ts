/**
 * Kernel WGSL: shape_match_transform — extrai rotação e calcula posições-meta.
 *
 * Executa serialmente (workgroup_size=1) pois precisa acumular o centro de massa
 * e o gradiente de deformação A_pq sobre todas as partículas antes de proceder.
 *
 * Sequência:
 *   1. Calcula CM ponderado: cm = Σ pred_i·w_i / Σ w_i
 *   2. Calcula gradiente de deformação: A_pq = Σ w_i · (pred_i − cm) ⊗ r_i
 *   3. Verificação de inversão (det < 0 → skip para evitar eversão de malha)
 *   4. Decomposição polar → quaternion R (warm-start do substep anterior)
 *   5. Escreve posições-meta: g_i = R·r_i + cm
 *   6. Salva quaternion em shape_state[0] para warm-start do próximo substep
 *
 * Bindings:
 *   @binding(0) SimParams        (uniform)
 *   @binding(1) Particle[]       (storage read)     — apenas pred.xyz é lido
 *   @binding(2) rest_positions[] (storage read)     — vec4f: xyz=r_i centrada, w=peso
 *   @binding(3) goal_positions[] (storage read_write) — escreve g_i = R·r_i + cm
 *   @binding(4) shape_state[]    (storage read_write) — quaternion warm-start (1 entry)
 *
 * Requer: SimParams, Particle (structs), mat.wgsl, quat.wgsl, shape_matching.wgsl.
 */
export const WGSL_KERNEL_SHAPE_MATCH_TRANSFORM = /* wgsl */`

@group(0) @binding(0) var<uniform>             params:         SimParams;
@group(0) @binding(1) var<storage, read>       particles:      array<Particle>;
@group(0) @binding(2) var<storage, read>       rest_positions: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> goal_positions: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> shape_state:    array<vec4f>;

@compute @workgroup_size(1)
fn shape_match_transform_main(@builtin(global_invocation_id) _gid: vec3u) {
    let N = params.particle_count;
    if (N == 0u) { return; }

    // ── 1. Centro de massa ponderado sobre posições previstas ─────────────────
    var cm    = vec3f(0.0);
    var w_sum = 0.0;
    for (var i = 0u; i < N; i++) {
        let w  = rest_positions[i].w;       // 1.0 (livre) ou 0.0 (fixada)
        cm    += particles[i].pred.xyz * w;
        w_sum += w;
    }
    if (w_sum < 1e-10) { return; }          // corpo totalmente fixado — skip
    cm /= w_sum;

    // ── 2. Gradiente de deformação A_pq = Σ w_i · (pred_i − cm) ⊗ r_i ───────
    // WGSL mat3x3f é column-major: mat3x3f(col0, col1, col2)
    // Coluna j do produto externo p ⊗ r = p * r[j]
    var A_pq = mat3x3f(vec3f(0.0), vec3f(0.0), vec3f(0.0));
    for (var i = 0u; i < N; i++) {
        let w = rest_positions[i].w;
        let p = particles[i].pred.xyz - cm;  // posição centrada atual
        let r = rest_positions[i].xyz;        // posição centrada de repouso
        A_pq[0] += p * r.x * w;
        A_pq[1] += p * r.y * w;
        A_pq[2] += p * r.z * w;
    }

    // ── 3. Verificação de inversão ───────────────────────────────────────────
    // det(A_pq) < 0 indica eversão (inside-out) — mantém quaternion, não escreve metas
    if (mat3_det(A_pq) < -1e-6) { return; }

    // ── 4. Decomposição polar — extrai rotação R ──────────────────────────────
    let q_prev = shape_state[0];
    let q_new  = polar_decomp_quaternion(A_pq, q_prev);
    shape_state[0] = q_new;                  // warm-start para próximo substep
    let R = mat3_from_quat(q_new);

    // ── 5. Posições-meta: g_i = R · r_i + cm ─────────────────────────────────
    for (var i = 0u; i < N; i++) {
        let r = rest_positions[i].xyz;
        goal_positions[i] = vec4f(R * r + cm, 0.0);
    }
}
`;
