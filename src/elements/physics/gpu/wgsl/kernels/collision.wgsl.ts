/**
 * Kernel WGSL: Collision — corrige posições previstas contra colliders SDF.
 *
 * Replica SoftBodyCollisionStage.execute() na GPU.
 * Para cada partícula (1 thread) × cada collider:
 *   1. Transforma pred para espaço local do collider via inv_world_mat.
 *   2. Avalia SDF conforme shape_type (0=Sphere, 1=Box, 2=Plane).
 *   3. Se d < particle_radius: penetração detectada.
 *   4. Gradiente numérico do SDF → normal no espaço mundo (mat4_upper3x3_transform).
 *   5. Passo 1 — move pos E pred pela correção completa (preserva velocidade XPBD).
 *   6. Passo 2 — restituição: impulso em pred proporcional à velocidade de aproximação.
 *
 * Partículas fixadas (pos.w = 0) são ignoradas.
 *
 * Bind groups:
 *   @group(0) @binding(0) — SimParams    (uniform)
 *   @group(0) @binding(1) — Particle[]   (storage read_write)
 *   @group(0) @binding(2) — ColliderDesc[] (storage read)
 *
 * Dispatch: ceil(particle_count / 64) workgroups.
 *
 * Depende de: SimParams, Particle, ColliderDesc, sdf.wgsl (eval_sdf, sdf_gradient),
 *             mat.wgsl (mat4_upper3x3_transform).
 */
export const WGSL_KERNEL_COLLISION = /* wgsl */`

@group(0) @binding(0) var<uniform>             params:    SimParams;
@group(0) @binding(1) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(2) var<storage, read>       colliders: array<ColliderDesc>;

@compute @workgroup_size(64)
fn collision_main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= params.particle_count) { return; }

    let inv_mass = particles[i].pos.w;
    if (inv_mass == 0.0) { return; }  // partícula fixada — ignora

    // collision_radius: margem de contato com colliders externos (tipicamente 0 — toca na superfície).
    // Usar particle_radius criaria uma folga de ~12 cm entre o pano e os colliders.
    let radius = params.collision_radius;

    for (var ci = 0u; ci < params.collider_count; ci++) {
        let col = colliders[ci];

        // Transforma pred para espaço local do collider
        let world_pred = particles[i].pred.xyz;
        let local_pred = (col.inv_world_mat * vec4f(world_pred, 1.0)).xyz;

        let d = eval_sdf(local_pred, col.shape_type, col.half);

        // Limites finitos do plano (bounds.xy = halfWidth, halfDepth em espaço local).
        // (0,0) significa sem limite. Partícula fora dos limites não colide com este collider.
        if (col.shape_type == 2u) {
            let bw = col.bounds.x;
            let bd = col.bounds.y;
            if (bw > 0.0 && (abs(local_pred.x) > bw || abs(local_pred.z) > bd)) { continue; }
        }

        if (d >= radius) { continue; }  // sem penetração — próxima iteração

        // Gradiente local → normal no espaço mundo via parte superior 3×3 da world_mat
        let grad_local = sdf_gradient(local_pred, d, col.shape_type, col.half);
        let wn_raw     = mat4_upper3x3_transform(col.world_mat, grad_local);
        let wn_len     = length(wn_raw);
        if (wn_len < 1e-8) { continue; }
        let wn = wn_raw / wn_len;  // normal de saída normalizada no espaço mundo

        let correction = radius - d;  // > 0 quando penetrando

        // Passo 1: move pos E pred pela correção completa
        // (preserva (pred - pos) / dt → velocidade XPBD inalterada)
        particles[i].pos  = vec4f(particles[i].pos.xyz  + correction * wn, particles[i].pos.w);
        particles[i].pred = vec4f(particles[i].pred.xyz + correction * wn, particles[i].pred.w);

        // Passo 2: restituição — impulso extra em pred se partícula se aproximava do collider
        // (vel pré-predict = velocidade do substep anterior, ainda armazenada em particles[i].vel)
        let vn = dot(particles[i].vel.xyz, wn);
        if (vn < 0.0) {
            let dv = -(1.0 + params.restitution) * vn;  // impulso ≥ 0
            particles[i].pred = vec4f(
                particles[i].pred.xyz + params.dt * dv * wn,
                particles[i].pred.w,
            );
        }
    }
}
`;
