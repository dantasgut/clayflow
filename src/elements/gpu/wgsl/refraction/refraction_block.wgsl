// A refração em meia resolução (spec 039 refeita, decisão do usuário: o traçado de 1 raio por bloco 2×2 com a
// reconstrução guiada pela profundidade): em cada bloco 2×2 de pixels, o representante do quadro é o primeiro pixel
// pedido na ordem que começa no da vez (a vez gira a cada quadro: cada pixel pedido é traçado ao menos a cada 6
// quadros; em xadrez, 11). Só o representante entra na fila; o fechamento grava o resultado dele nos pixels pedidos do bloco à mesma
// distância (a mesma superfície); os outros guardam o valor anterior até a vez deles.
// Requer: REFRACTION_REQUEST_VALID, refraction, refraction_request.

/** A ordem dos pixels no bloco (a vez gira por ela). */
const REFRACTION_BLOCK_ORDER = array<vec2u, 4>(vec2u(0u, 0u), vec2u(1u, 1u), vec2u(1u, 0u), vec2u(0u, 1u));

/** O pixel `p` está pedido (dentro da tela)? */
fn refraction_block_requested(p: vec2u, size: vec2u) -> bool {
    if (any(p >= size)) { return false; }
    return (textureLoad(refraction_request, p, 0).y & REFRACTION_REQUEST_VALID) != 0u;
}

/**
 * O representante do bloco do pixel `p` no quadro (xy; z = 1 quando o bloco tem pixel pedido): o primeiro pedido na
 * ordem que começa no da vez.
 *
 * A vez espalha as posições da amostra que cada pixel recebe (Halton 2, 3 do antisserrilhado temporal) pelo pixel
 * inteiro nos dois eixos, em qualquer fase entre o quadro da refração e a sequência (T075). Os quadros contam desde o
 * último corte da câmera (`sample_origin`), quando a sequência recomeça: duas cenas acumuladas desde um corte (o mesmo
 * deslocamento da amostra em cada quadro) traçam os mesmos pixels em cada quadro — antes, a fase dependia de quantos
 * quadros cada uma desenhou até ficar pronta, e a imagem da mesma cena mudava de uma rodada para outra. Pela soma dos dígitos do
 * quadro na base 4 (antes) o x se espalhava, mas o y (base 3) não: cada pixel ficava com posições de um terço do pixel em
 * y — o centro deslocado até 0,2 px, a cobertura de uma borda errada em até 31–42 % em 256 quadros, conforme a fase —, e
 * as bordas vistas pelo vidro com relevo e pela água ondulada saíam deslocadas até 1 px, umas rodadas sim, outras não
 * (`refraction`, `relief` e `ripple`). Agora `(3f + ⌊f/16⌋ + ⌊f/64⌋) mod 4`, escolhida numa busca entre as somas de
 * ⌊f/m⌋ (m = 1, 3, 4, 9, 12, 16, 64) pela cobertura de bordas: 5–6 % em 256 quadros em toda fase (3 % em 64 da sequência
 * de 64), cada pixel traçado a cada ≤ 6 quadros (em cada 4 quadros seguidos com ⌊f/16⌋ igual a vez passa pelos quatro).
 * Em xadrez (Opção B2), os blocos de `refraction_block_turn` e a vez `(2f + ⌊f/2⌋ + ⌊f/8⌋ + ⌊f/64⌋) mod 4`: 9–13 % em
 * 256 quadros nas sequências de 64 e 256 (eram 13–19 % e, na de 64, 44–69 %), ≤ 11 quadros entre dois traçados (eram 15).
 */
fn refraction_block_rep(p: vec2u, size: vec2u) -> vec3u {
    let corner = p & vec2u(~1u);
    let f = refraction.frame - refraction.sample_origin;
    let plain = 3u * f + f / 16u + f / 64u;
    let checker = 2u * f + f / 2u + f / 8u + f / 64u;
    let start = select(plain, checker, refraction.checkerboard != 0u) % 4u;
    for (var k = 0u; k < 4u; k++) {
        let q = corner + REFRACTION_BLOCK_ORDER[(start + k) % 4u];
        if (refraction_block_requested(q, size)) { return vec3u(q, 1u); }
    }
    return vec3u(0u);
}

/**
 * O bloco do pixel `p` é traçado neste quadro (sempre; em xadrez, os da paridade de `f + ⌊f/8⌋`)? Os blocos de uma
 * paridade veem metade das posições da amostra, e a vez entre elas as espalha pelo pixel (`refraction_block_rep`).
 */
fn refraction_block_turn(p: vec2u) -> bool {
    if (refraction.checkerboard == 0u) { return true; }
    let b = p / 2u;
    let f = refraction.frame - refraction.sample_origin;
    return ((b.x + b.y + f + f / 8u) & 1u) == 0u;
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
