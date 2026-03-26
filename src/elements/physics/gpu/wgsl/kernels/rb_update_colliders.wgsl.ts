/**
 * Kernel WGSL: rb_update_colliders — sincroniza world_mat e inv_world_mat
 * dos ColliderDescs dinâmicos com as posições previstas (pos_pred/rot_pred) dos corpos.
 *
 * Executa 1× por frame, APÓS rb_predict e ANTES de rb_narrowphase.
 * Para cada collider cujo body_owner_idx != 0xFFFFFFFFu:
 *   1. Lê pos_pred e rot_pred do corpo dono
 *   2. Calcula world_mat = quat_to_mat4(rot_pred, pos_pred)
 *   3. Calcula inv_world_mat = rigid_mat4_inverse(world_mat)
 *   4. Escreve ambos no buffer de colliders
 *
 * Elimina o atraso de 1 frame causado pelo ciclo CPU:
 *   GPU readback → body.set(position) → ColliderDescriptorUploader.upload() → GPU narrowphase
 * Substituído pelo pipeline puramente GPU:
 *   rb_predict (pos_pred) → rb_update_colliders → rb_narrowphase
 *
 * Colliders estáticos (body_owner_idx == 0xFFFFFFFFu) são ignorados —
 * suas matrizes continuam sendo enviadas pelo ColliderDescriptorUploader no lado CPU.
 *
 * Bind groups:
 *   @group(0) @binding(0) — RBSimParams    (uniform)
 *   @group(0) @binding(1) — RigidBody[]    (storage read)
 *   @group(0) @binding(2) — ColliderDesc[] (storage read_write)
 *
 * Dispatch: ceil(collider_count / 64) workgroups.
 *
 * Depende de: RBSimParams, RigidBody, ColliderDesc,
 *             mat.wgsl (quat_to_mat4, rigid_mat4_inverse).
 */
export const WGSL_KERNEL_RB_UPDATE_COLLIDERS = /* wgsl */`

@group(0) @binding(0) var<uniform>             rb_params: RBSimParams;
@group(0) @binding(1) var<storage, read>       bodies:    array<RigidBody>;
@group(0) @binding(2) var<storage, read_write> colliders: array<ColliderDesc>;

@compute @workgroup_size(64, 1, 1)
fn rb_update_colliders(@builtin(global_invocation_id) gid: vec3u) {
    let ci = gid.x;
    if (ci >= rb_params.collider_count) { return; }

    let owner = colliders[ci].body_owner_idx;
    if (owner == 0xFFFFFFFFu) { return; }  // collider estático — CPU mantém as matrizes

    if (owner >= rb_params.body_count) { return; }  // índice inválido — guarda de segurança

    let pos = bodies[owner].pos_pred.xyz;
    let rot = bodies[owner].rot_pred;

    let world = quat_to_mat4(rot, pos);
    colliders[ci].world_mat     = world;
    colliders[ci].inv_world_mat = rigid_mat4_inverse(world);
}
`;
