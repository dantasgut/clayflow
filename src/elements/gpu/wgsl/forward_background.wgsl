// Fundo da cena no passe principal (spec 033, R4): um triângulo de tela cheia no plano distante, desenhado depois dos
// opacos com profundidade `less-equal` sem escrita — só onde nada foi desenhado —, com a direção de cada pixel saindo
// da câmera ativa (perspectiva: pelos fatores da projeção; ortográfica: a direção da vista) e a cor do ponto de cena
// `scene_background` (o céu físico, quando há) atrás da névoa (`scene_fog`). Sem contribuinte de nenhum dos dois o
// estágio não desenha (fica a limpeza). Com o alvo da luz que chega (sem MSAA, a resolução temporal), o fundo escreve nele
// a própria radiância (brilho YCoCg, direta e toda): no céu tudo é luz — a resolução temporal reilumina o histórico do
// fundo quando ela muda (spec 041: o céu e as nuvens do crepúsculo escurecem ~100× em segundos).
// Requer: cameras, camera_space, forward_frame, scene_background, scene_fog, SCENE_FOG_BACKGROUND, color.

/**
 * Teto da cor do fundo: o alvo da cena é meio-float (máx. 65504), com a folga do alvo da luz que chega. O limite vale para
 * a soma, não para as parcelas (spec 041, T075): o céu e a luz do trecho perto que a névoa tira dele passam do teto perto
 * do sol baixo, e a diferença de parcelas já limitadas sai com cada canal errado de um jeito.
 */
const BACKGROUND_MAX: f32 = 60000.0;

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

fn background_color(in: BackgroundOut) -> vec3f {
    let cam = cameras[forward_frame.cameraSlot];
    // A direção do raio da câmera pelo pixel (sem o deslocamento da amostra; ortográfica: a direção da vista).
    let dir = camera_ray_ndc(forward_frame.cameraSlot, in.ndc).dir;
    // O fundo atrás de toda a névoa (o ponto no infinito: além da última fatia dos froxels; a atmosfera já está nele).
    let fog = scene_fog(cam.position.xyz + dir * SCENE_FOG_BACKGROUND);
    return min(scene_background(dir) * fog.transmittance + fog.scattered, vec3f(BACKGROUND_MAX));
}

@fragment
fn fs_background(in: BackgroundOut) -> @location(0) vec4f {
    return vec4f(background_color(in), 1.0);
}

struct BackgroundLightOut {
    @location(0) color: vec4f,
    @location(1) light: vec2f,
}

@fragment
fn fs_background_light(in: BackgroundOut) -> BackgroundLightOut {
    let c = background_color(in);
    return BackgroundLightOut(vec4f(c, 1.0), vec2f(min(ycocg(c).x, 60000.0)));
}
