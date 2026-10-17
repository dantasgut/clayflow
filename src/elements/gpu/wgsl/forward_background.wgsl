// Fundo da cena no passe principal (spec 033, R4): um triângulo de tela cheia no plano distante, desenhado depois dos
// opacos com profundidade `less-equal` sem escrita — só onde nada foi desenhado —, com a direção de cada pixel saindo
// da câmera ativa (perspectiva: pelos fatores da projeção; ortográfica: a direção da vista) e a cor do ponto de cena
// `scene_background` (o céu físico, quando há). Sem contribuinte o estágio não desenha (fica a limpeza).
// Requer: cameras, forward_frame, scene_background.

struct BackgroundOut {
    @builtin(position) clip: vec4f,
    @location(0) ndc: vec2f,
}

@vertex
fn vs_background(@builtin(vertex_index) vid: u32) -> BackgroundOut {
    let x = f32((vid << 1u) & 2u);
    let y = f32(vid & 2u);
    let ndc = vec2f(x * 2.0 - 1.0, 1.0 - y * 2.0);
    return BackgroundOut(vec4f(ndc, 1.0, 1.0), ndc);
}

@fragment
fn fs_background(in: BackgroundOut) -> @location(0) vec4f {
    let cam = cameras[forward_frame.cameraSlot];
    let p = cam.projection;
    var dir_view = vec3f(0.0, 0.0, -1.0);
    if (p[3][3] != 1.0) {
        dir_view = vec3f(in.ndc.x / p[0][0], in.ndc.y / p[1][1], -1.0);
    }
    // A inversa da rotação da vista é a transposta.
    let v = cam.view;
    let dir = normalize(transpose(mat3x3f(v[0].xyz, v[1].xyz, v[2].xyz)) * dir_view);
    return vec4f(scene_background(dir), 1.0);
}
