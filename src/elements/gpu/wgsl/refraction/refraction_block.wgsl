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
    let start = refraction.frame % 4u;
    for (var k = 0u; k < 4u; k++) {
        let q = corner + REFRACTION_BLOCK_ORDER[(start + k) % 4u];
        if (refraction_block_requested(q, size)) { return vec3u(q, 1u); }
    }
    return vec3u(0u);
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
