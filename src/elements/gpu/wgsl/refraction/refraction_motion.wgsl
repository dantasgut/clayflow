// Movimento do que a refração mostra (spec 034, R3, T044a): nos pixels com pedido, o ponto que o traçado achou
// (`refraction_hit`: o fim do caminho que mais contribui para a cor) e onde ele estava no quadro anterior
// (`refraction_previous_point`), projetados pelas duas câmeras (sem o deslocamento da amostra). Sai o vetor de "o que
// está atrás" (ba do alvo `motion`).
// A lente desloca e inverte a imagem do que está atrás, e o pixel também mostra caminhos secundários (a reflexão
// interna): esse vetor não basta para a resolução temporal. Por isso a máscara reativa, onde ela recomeça o histórico:
// a cena mudou em volta do pixel além de `REFRACTION_REACTIVE_CHANGE` pelo gradiente temporal (`refraction_change`: a
// amostra do quadro anterior refeita na cena de agora) — um objeto ou uma sombra que passou, por qualquer caminho;
// nunca o ruído nem a câmera em movimento.
// Requer: refraction_screen, REFRACTION_REQUEST_VALID, refraction, camera, cameras, refraction_history,
// refraction_request, refraction_hit.

/**
 * Mudança relativa da cena (`refraction_change`) a partir da qual o histórico da resolução temporal recomeça. Empírico:
 * abaixo disso o filtro do sinal traçado já encurta o próprio histórico na proporção da mudança, e a caixa de variância
 * da resolução recorta o resto num sinal limpo.
 */
const REFRACTION_REACTIVE_CHANGE: f32 = 0.25;

struct RefractionMotionOut {
    @location(0) motion: vec4f,
    @location(1) reactive: f32,
}

@fragment
fn refraction_motion_fs(@builtin(position) frag: vec4f) -> RefractionMotionOut {
    let px = vec2u(frag.xy);
    let request = textureLoad(refraction_request, px, 0);
    if ((request.y & REFRACTION_REQUEST_VALID) == 0u) { discard; }
    let hit = textureLoad(refraction_hit, px, 0);
    let before = refraction_previous_point(hit);
    let m = motion_vector(before, hit.xyz, refraction.camera_slot);
    var out: RefractionMotionOut;
    out.motion = vec4f(0.0, 0.0, m.zw);
    out.reactive = select(0.0, 1.0, refraction_change(px) > REFRACTION_REACTIVE_CHANGE);
    return out;
}
