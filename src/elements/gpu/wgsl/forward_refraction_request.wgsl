// Pedido da refração (spec 034, R1): depois dos opacos, os transmissivos desenhados com as duas faces numa profundidade
// própria (teste `less`: fica a superfície mais próxima por pixel, determinística) marcam os pixels cuja primeira
// superfície vista é uma interface — a distância até ela ao longo do raio da câmera do pixel e as marcas (há pedido;
// face de trás, quando a câmera está dentro do meio). Atrás de um opaco não há pedido (a profundidade dos opacos, com
// ou sem amostras: a 0). O estágio da refração refaz o raio da câmera desses pixels (`camera_ray`) e começa nessa
// distância; o raster só os escolhe. Na perspectiva os raios saem da posição da câmera (a distância até ela); na
// ortográfica saem paralelos do plano da câmera (a distância à frente dela) — com a distância até a posição, o raio
// de um pixel fora do eixo começava depois da interface, dentro do meio.
// Requer: forward (vértice, câmeras); `view_space`; `scene_depth`.

@fragment
fn fs_refraction_request(in: VsOut, @builtin(front_facing) front: bool) -> @location(0) vec4u {
    if (in.clip_position.z >= textureLoad(scene_depth, vec2i(in.clip_position.xy), 0)) { discard; }
    let cam = cameras[forward_frame.cameraSlot];
    let marks = select(REFRACTION_REQUEST_VALID | REFRACTION_REQUEST_BACK_FACE, REFRACTION_REQUEST_VALID, front);
    let to = in.world_position - cam.position.xyz;
    let ahead = dot(to, -normalize(cam.inverseView[2].xyz));
    let d = select(length(to), ahead, is_orthographic(cam.projection));
    return vec4u(bitcast<u32>(d), marks, 0u, 0u);
}
