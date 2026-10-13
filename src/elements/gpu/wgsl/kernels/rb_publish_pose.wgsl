// Publicação da pose (spec 007): copia posição e rotação de cada corpo rígido para o `Transform` da sua entidade, na
// GPU — o estágio de transformação compõe a matriz no mesmo quadro, sem leitura de volta.
// Requer: structs RigidBody, RigidPose, RigidPoseInstance, Transform, PosePublishParams.

@group(0) @binding(0) var<storage, read>       bodies:     array<RigidBody>;
@group(0) @binding(1) var<storage, read>       poses:      array<RigidPose>;
@group(0) @binding(2) var<storage, read>       pose_list:  array<RigidPoseInstance>;
@group(0) @binding(3) var<storage, read_write> transforms: array<Transform>;
@group(0) @binding(4) var<uniform>             publish:    PosePublishParams;

@compute @workgroup_size(64)
fn rb_publish_pose_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    let i = gid3.x + gid3.y * nwg.x * 64u;
    if (i >= publish.count) { return; }
    let r = poses[pose_list[publish.first + i].pose];
    let body = bodies[r.bodySlot];
    // Rotação normalizada; quaternion nulo vira identidade (como a publicação na CPU antes da 007).
    let len = length(body.rot);
    transforms[r.transformSlot].position = vec4f(body.pos.xyz, 1.0);
    transforms[r.transformSlot].rotation = select(vec4f(0.0, 0.0, 0.0, 1.0), body.rot / len, len > 1e-6);
}
