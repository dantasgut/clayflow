// portado de legacy/elements/physics/gpu/wgsl/kernels/rb_sync_transform.wgsl.ts
@group(0) @binding(0) var<uniform>             rb_params:   RBSimParams;
@group(0) @binding(1) var<storage, read>        bodies:      array<RigidBody>;
@group(0) @binding(2) var<storage, read>        rb_to_ubo:   array<u32>;
@group(0) @binding(3) var<storage, read_write>  object_ubos: array<vec4f>;

@compute @workgroup_size(64)
fn rb_sync_transform_main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= rb_params.body_count) { return; }

    let ubo_slot = rb_to_ubo[i];
    let pos      = bodies[i].pos_pred.xyz;
    let q        = bodies[i].rot_pred;

    // Normaliza quaternion para evitar drift de escala acumulado
    let qn  = normalize(q);

    // Constrói mat3x3f de rotação a partir do quaternion normalizado
    let rot3 = mat3_from_quat(qn);

    // TRS column-major: colunas 0-2 = rotação, coluna 3 = translação
    let col0 = vec4f(rot3[0], 0.0);
    let col1 = vec4f(rot3[1], 0.0);
    let col2 = vec4f(rot3[2], 0.0);
    let col3 = vec4f(pos, 1.0);

    // UBO stride = 256 bytes = 16 vec4f por slot.
    // Escreve as 4 colunas da mat4x4f nos primeiros 4 vec4f do slot.
    let base = ubo_slot * 16u;
    object_ubos[base + 0u] = col0;
    object_ubos[base + 1u] = col1;
    object_ubos[base + 2u] = col2;
    object_ubos[base + 3u] = col3;
}
