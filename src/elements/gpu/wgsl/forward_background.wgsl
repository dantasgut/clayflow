// Fundo da cena no passe principal (spec 033, R4): um triângulo de tela cheia no plano distante, desenhado depois dos
// opacos com profundidade `less-equal` sem escrita — só onde nada foi desenhado —, com a direção de cada pixel saindo
// da câmera ativa (perspectiva: pelos fatores da projeção; ortográfica: a direção da vista) e a cor do ponto de cena
// `scene_background` (o céu físico, quando há) atrás da névoa (`scene_fog`). Sem contribuinte de nenhum dos dois o
// estágio não desenha (fica a limpeza).
// Requer: cameras, camera_space, forward_frame, scene_background, scene_fog.

struct BackgroundOut {
    @builtin(position) clip: vec4f,
    @location(0) ndc: vec2f,
}

@vertex
fn vs_background(@builtin(vertex_index) vid: u32) -> BackgroundOut {
    let x = f32((vid << 1u) & 2u);
    let y = f32(vid & 2u);
    let ndc = uv_to_ndc(vec2f(x, y));
    return BackgroundOut(vec4f(ndc, 1.0, 1.0), ndc);
}

@fragment
fn fs_background(in: BackgroundOut) -> @location(0) vec4f {
    let cam = cameras[forward_frame.cameraSlot];
    // A direção do raio da câmera pelo pixel (sem o deslocamento da amostra; ortográfica: a direção da vista).
    let dir = camera_ray_ndc(forward_frame.cameraSlot, in.ndc).dir;
    // O fundo atrás de toda a névoa (o ponto bem além da última fatia dos froxels).
    let fog = scene_fog(cam.position.xyz + dir * 1e5);
    return vec4f(scene_background(dir) * fog.a + fog.rgb, 1.0);
}
