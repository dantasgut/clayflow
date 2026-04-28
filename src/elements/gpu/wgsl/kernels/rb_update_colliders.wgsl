// portado de legacy/elements/physics/gpu/wgsl/kernels/rb_update_colliders.wgsl.ts
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
