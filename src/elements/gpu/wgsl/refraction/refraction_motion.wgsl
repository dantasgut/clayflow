// Movimento do que a refração mostra (spec 034, R3, T044a): nos pixels com pedido, o ponto que o traçado achou
// (`refraction_hit`: o fim do caminho que mais contribui para a cor) e onde ele estava no quadro anterior
// (`refraction_previous_point`), projetados pelas duas câmeras (sem o deslocamento da amostra). Sai o vetor de "o que
// está atrás" (ba do alvo `motion`), no mínimo do tamanho do quanto o ponto mostrado pelo pixel andou desde o quadro
// anterior (`refraction_hit_previous`, em larguras de pixel no ponto, menos a de que a amostra deslocada anda): a
// superfície da água que ondula não se move na tela, mas a imagem do fundo que ela leva sim — a resolução temporal a
// trata como em movimento (o histórico curto, com o recorte); parada de fato, ela segue acumulando.
// A lente desloca e inverte a imagem do que está atrás, e o pixel também mostra caminhos secundários (a reflexão
// interna): esse vetor não basta para a resolução temporal. Por isso a máscara reativa, onde ela recomeça o histórico:
// a cena mudou em volta do pixel além de `REFRACTION_REACTIVE_CHANGE` pelo gradiente temporal (`refraction_change`: a
// amostra do quadro anterior refeita na cena de agora) — um objeto ou uma sombra que passou, por qualquer caminho;
// nunca o ruído nem a câmera em movimento.
// Requer: refraction_screen, REFRACTION_REQUEST_VALID, refraction, camera, cameras, refraction_history,
// refraction_request, refraction_hit, refraction_hit_previous.

/**
 * Mudança relativa da cena (`refraction_change`) a partir da qual o histórico da resolução temporal recomeça. Empírico:
 * abaixo disso o filtro do sinal traçado já encurta o próprio histórico na proporção da mudança, e a caixa de variância
 * da resolução recorta o resto num sinal limpo.
 */
const REFRACTION_REACTIVE_CHANGE: f32 = 0.25;

/**
 * Larguras de pixel no ponto que o ponto mostrado anda entre dois quadros só pela amostra deslocada dentro do pixel (o
 * deslocamento do antisserrilhado temporal, até um pixel entre dois quadros): abaixo disso, a imagem está parada.
 */
const REFRACTION_JITTER_SPAN: f32 = 1.0;

/**
 * Escala do quanto a imagem andou no vetor de "o que está atrás": a resolução temporal conta o pixel em movimento por
 * inteiro a partir de 0,1 pixel do vetor (`taa_moving`) — a imagem que anda um pixel além do da amostra deslocada; abaixo,
 * na proporção (a ondulação lenta guarda mais histórico e não mostra os degraus da borda que ela leva).
 */
const REFRACTION_DRIFT_SCALE: f32 = 0.1;

/**
 * Quanto (em pixels) a imagem mostrada pelo pixel `px` andou desde o quadro anterior: a distância entre o ponto de agora
 * (`hit`) e o de antes no mesmo pixel, do mesmo objeto, em larguras de pixel no ponto, menos `REFRACTION_JITTER_SPAN`.
 * Outro objeto (uma borda que a amostra cruza) não diz quanto andou: 0.
 */
fn refraction_shown_drift(px: vec2u, hit: vec4f) -> f32 {
    let before = textureLoad(refraction_hit_previous, px, 0);
    if (bitcast<u32>(before.w) != bitcast<u32>(hit.w)) { return 0.0; }
    let footprint = refraction_footprint(px, hit);
    return max(distance(before.xyz, hit.xyz) / max(footprint, 1e-6) - REFRACTION_JITTER_SPAN, 0.0);
}

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
    // O vetor de "o que está atrás" com no mínimo o quanto a imagem mostrada andou (a direção não importa a quem o lê).
    let size = vec2f(textureDimensions(refraction_hit));
    let drift = REFRACTION_DRIFT_SCALE * refraction_shown_drift(px, hit) / size.x;
    var behind = m.zw;
    if (length(behind) < drift) { behind = vec2f(drift, 0.0); }
    var out: RefractionMotionOut;
    out.motion = vec4f(0.0, 0.0, behind);
    out.reactive = select(0.0, 1.0, refraction_change(px) > REFRACTION_REACTIVE_CHANGE);
    return out;
}
