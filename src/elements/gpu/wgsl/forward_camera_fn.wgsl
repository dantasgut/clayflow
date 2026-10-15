// Projeção do desenho forward pela função `camera` da câmera ativa (spec 009): liga o pool `CameraFnRecord` (grupo 2,
// binding 1 — o grupo do material, religado a cada pipeline) e projeta o ponto pela `camera_project` da função, com os
// parâmetros da câmera ativa (`forward_frame.cameraFnSlot`). Toma o lugar de `forward_camera_ready`.
// Requer: struct CameraFnRecord; o binding `cameras` e o uniforme `forward_frame` do forward; a função (camera_project,
// camera_fn_params).

@group(2) @binding(1) var<storage, read> camera_fn_records: array<CameraFnRecord>;

fn camera_clip(slot: u32, world: vec4f) -> vec4f {
    let view_pos = (cameras[slot].view * world).xyz;
    return camera_project(view_pos, camera_fn_params(camera_fn_records[forward_frame.cameraFnSlot]));
}
