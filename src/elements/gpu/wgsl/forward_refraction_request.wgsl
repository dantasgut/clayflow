// Pedido da refração (spec 034, R1): depois dos opacos, os transmissivos desenhados com as duas faces numa profundidade
// própria (teste `less`: fica a superfície mais próxima por pixel, determinística) marcam os pixels cuja primeira
// superfície vista é uma interface — a distância da câmera até ela e as marcas (há pedido; face de trás, quando a
// câmera está dentro do meio). Atrás de um opaco não há pedido (a profundidade dos opacos, com ou sem amostras: a 0).
// O estágio da refração refaz o raio da câmera desses pixels; o raster só os escolhe.
// Requer: forward (vértice, câmeras); `scene_depth`.

@fragment
fn fs_refraction_request(in: VsOut, @builtin(front_facing) front: bool) -> @location(0) vec2u {
    if (in.clip_position.z >= textureLoad(scene_depth, vec2i(in.clip_position.xy), 0)) { discard; }
    let cam = cameras[forward_frame.cameraSlot];
    let marks = select(REFRACTION_REQUEST_VALID | REFRACTION_REQUEST_BACK_FACE, REFRACTION_REQUEST_VALID, front);
    return vec2u(bitcast<u32>(distance(cam.position.xyz, in.world_position)), marks);
}
