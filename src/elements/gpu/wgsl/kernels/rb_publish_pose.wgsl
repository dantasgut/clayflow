// Publicação da pose (spec 007): copia posição e rotação de cada corpo rígido para o `Transform` da sua entidade, na
// GPU — o estágio de transformação compõe a matriz no mesmo quadro, sem leitura de volta.
// Requer: structs RigidBody, RigidPose, RigidPoseInstance, Transform, PosePublishParams.

@compute @workgroup_size(WORKGROUP_SIZE)
fn rb_publish_pose_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= publish.count) { return; }
    let r = poses[pose_list[publish.first + i].pose];
    let body = bodies[r.bodySlot];
    // Rotação normalizada; quaternion nulo vira identidade (como a publicação na CPU antes da 007).
    let len = length(body.rot);
    transforms[r.transformSlot].position = vec4f(body.pos.xyz, 1.0);
    transforms[r.transformSlot].rotation = select(vec4f(0.0, 0.0, 0.0, 1.0), body.rot / len, len > 1e-6);
}
