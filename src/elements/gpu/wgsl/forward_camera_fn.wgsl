// Projeção do desenho forward pela função `camera` da câmera ativa (spec 009): projeta o ponto pela `camera_project`
// da função, com os parâmetros da câmera ativa (`forward_frame.cameraFnSlot`: o slot do registro dela no pool da forma
// da função, lido pelo carregador `camera_fn_params`, spec 031). Toma o lugar de `forward_camera_ready`.
// Requer: os recursos `cameras` e `forward_frame`; a função (camera_project, camera_fn_params).

fn camera_clip(slot: u32, world: vec4f) -> vec4f {
    let view_pos = (cameras[slot].view * world).xyz;
    return camera_project(view_pos, camera_fn_params(forward_frame.cameraFnSlot));
}
