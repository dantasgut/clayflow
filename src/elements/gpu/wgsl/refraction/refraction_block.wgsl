// A refração em meia resolução (spec 039 refeita, decisão do usuário: o traçado de 1 raio por bloco 2×2 com a
// reconstrução guiada pela profundidade): em cada bloco 2×2 de pixels, o representante do quadro é o primeiro pixel
// pedido na ordem que começa no da vez (a vez gira a cada quadro: cada pixel pedido é traçado ao menos a cada 4
// quadros). Só o representante entra na fila; o fechamento grava o resultado dele nos pixels pedidos do bloco à mesma
// distância (a mesma superfície); os outros guardam o valor anterior até a vez deles.
// Requer: REFRACTION_REQUEST_VALID, refraction, refraction_request.

/** A ordem dos pixels no bloco (a vez gira por ela). */
const REFRACTION_BLOCK_ORDER = array<vec2u, 4>(vec2u(0u, 0u), vec2u(1u, 1u), vec2u(1u, 0u), vec2u(0u, 1u));

/** O pixel `p` está pedido (dentro da tela)? */
fn refraction_block_requested(p: vec2u, size: vec2u) -> bool {
    if (any(p >= size)) { return false; }
    return (textureLoad(refraction_request, p, 0).y & REFRACTION_REQUEST_VALID) != 0u;
}

/** O representante do bloco do pixel `p` no quadro (xy; z = 1 quando o bloco tem pixel pedido). */
fn refraction_block_rep(p: vec2u, size: vec2u) -> vec3u {
    let corner = p & vec2u(~1u);
    // A vez pela soma dos dígitos do quadro na base 4, não pelo quadro: a posição da amostra no pixel é a de Halton, e
    // na base 2 o quadro módulo 4 fixa os dois primeiros bits do x — girando a vez pelo quadro, cada pixel só era traçado
    // com as amostras de uma faixa de 1/4 do pixel, qual faixa pela fase do contador (a integral do acúmulo mudava 0,4 %
    // com um quadro a mais antes do corte). Pela soma, em cada 4 quadros seguidos com os mesmos dígitos de cima a vez
    // passa por todos os pixels (cada um traçado a cada 4 quadros, como antes), e a faixa do pixel gira com os de cima.
    // Em xadrez (Opção B2) o bloco é traçado em quadros alternados: a vez avança a cada traçado dele e mais uma a cada
    // ciclo de 8 quadros (`refraction_block_turn`).
    let f = refraction.frame;
    let digits = f + f / 4u + f / 16u + f / 64u + f / 256u + f / 1024u;
    let start = select(digits, f / 2u + f / 8u, refraction.checkerboard != 0u) % 4u;
    for (var k = 0u; k < 4u; k++) {
        let q = corner + REFRACTION_BLOCK_ORDER[(start + k) % 4u];
        if (refraction_block_requested(q, size)) { return vec3u(q, 1u); }
    }
    return vec3u(0u);
}

/**
 * O bloco do pixel `p` é traçado neste quadro (sempre; em xadrez, os da paridade do quadro)? Descorrelação com o
 * antisserrilhado temporal (a sequência de Halton das posições da amostra): traçado só em quadros de uma paridade e a cada
 * 8 quadros, o pixel veria só 1/8 das posições — a imagem parada sairia com viés. A fase do xadrez troca a cada 4 ciclos
 * de 8 quadros e a vez no bloco avança a cada ciclo: em 64 quadros cada pixel passa pelos 8 resíduos do quadro.
 */
fn refraction_block_turn(p: vec2u) -> bool {
    if (refraction.checkerboard == 0u) { return true; }
    let b = p / 2u;
    let f = refraction.frame;
    return ((b.x + b.y + f + f / 32u) & 1u) == 0u;
}

/** O pixel pedido `q` do bloco recebe o resultado do representante `rep` (a mesma superfície: distância e face)? */
fn refraction_block_shares(q: vec2u, rep: vec2u, size: vec2u) -> bool {
    if (!refraction_block_requested(q, size)) { return false; }
    let a = textureLoad(refraction_request, q, 0);
    let b = textureLoad(refraction_request, rep, 0);
    let da = bitcast<f32>(a.x);
    let db = bitcast<f32>(b.x);
    return a.y == b.y && abs(da - db) <= 0.02 * db + 1e-3;
}
