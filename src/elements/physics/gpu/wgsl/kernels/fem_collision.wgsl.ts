/**
 * Kernel WGSL: fem_collision — colisão nó FEM × collider SDF estático.
 *
 * Idêntico em lógica ao kernel `collision` do SoftBody (XPBD partícula-SDF),
 * mas lê FEMSimParams em vez de SimParams para os contadores corretos.
 *
 * Para cada nó dinâmico (inv_mass > 0) × cada collider estático:
 *   1. Transforma pred para espaço local do collider via inv_world_mat
 *   2. Avalia SDF; pula se d >= collision_radius
 *   3. Gradiente numérico do SDF → normal em world space
 *   4. Corrige pos E pred pela penetração (preserva velocidade XPBD)
 *   5. Restituição: impulso em pred proporcional à velocidade de aproximação
 *
 * Bind groups:
 *   @group(0) @binding(0) — FEMSimParams   (uniform)
 *   @group(0) @binding(1) — Particle[]     (storage read_write) — nós
 *   @group(0) @binding(2) — ColliderDesc[] (storage read)
 *
 * Dispatch: ceil(node_count / 64) workgroups.
 *
 * Depende de: FEMSimParams, Particle, ColliderDesc,
 *             sdf.wgsl (eval_sdf, sdf_gradient), mat.wgsl (mat4_upper3x3_transform).
 */
export const WGSL_KERNEL_FEM_COLLISION = /* wgsl */`

@group(0) @binding(0) var<uniform>             fem_params: FEMSimParams;
@group(0) @binding(1) var<storage, read_write> nodes:      array<Particle>;
@group(0) @binding(2) var<storage, read>       colliders:  array<ColliderDesc>;

@compute @workgroup_size(64)
fn fem_collision_main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= fem_params.node_count) { return; }

    let inv_mass = nodes[i].pos.w;
    if (inv_mass == 0.0) { return; }  // nó fixo — ignora

    let radius = fem_params.collision_radius;

    for (var ci = 0u; ci < fem_params.collider_count; ci++) {
        let col = colliders[ci];

        let world_pred = nodes[i].pred.xyz;
        let local_pred = (col.inv_world_mat * vec4f(world_pred, 1.0)).xyz;

        let d = eval_sdf(local_pred, col.shape_type, col.half);

        // Limites finitos do plano
        if (col.shape_type == 2u) {
            let bw = col.bounds.x;
            let bd = col.bounds.y;
            if (bw > 0.0 && (abs(local_pred.x) > bw || abs(local_pred.z) > bd)) { continue; }
        }

        if (d >= radius) { continue; }

        let depth = radius - d;  // profundidade de penetração positiva

        // Normal em world space via gradiente numérico
        let grad_local = sdf_gradient(local_pred, d, col.shape_type, col.half);
        let wn_raw = mat4_upper3x3_transform(col.world_mat, grad_local);
        let wn_len = length(wn_raw);
        if (wn_len < 1e-8) { continue; }
        let wn = wn_raw / wn_len;

        // Passo 1: corrige pred E pos para preservar a velocidade XPBD (vel = (pred-pos)/dt)
        nodes[i].pred = vec4f(nodes[i].pred.xyz + depth * wn, nodes[i].pred.w);
        nodes[i].pos  = vec4f(nodes[i].pos.xyz  + depth * wn, nodes[i].pos.w);

        // Passo 2: restituição — impulso em pred na direção normal
        let vel_pred    = (nodes[i].pred.xyz - nodes[i].pos.xyz) / max(fem_params.dt_sub, 1e-12);
        let v_along_n   = dot(vel_pred, wn);
        if (v_along_n < 0.0) {
            let restitution = fem_params.restitution;
            nodes[i].pred = vec4f(
                nodes[i].pred.xyz - (1.0 + restitution) * v_along_n * fem_params.dt_sub * wn,
                nodes[i].pred.w,
            );
        }
    }
}
`;
