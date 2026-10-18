// Onde a imagem refratada serrilha ou se separa em cores (spec 034, antisserrilhado e dispersão; ver
// `refraction_samples.wgsl`): marca na lista os pixels que levam mais amostras que a do centro.
// - Antisserrilhado: as extras (pontos dentro do pixel) onde o que se vê muda de um pixel para o
//   vizinho (contraste relativo acima de `REFRACTION_CONTRAST` na radiância da amostra do centro: uma borda vista pelo
//   vidro, em escala ou reduzida pela lente, o padrão fino ao longe) ou numa borda refratada (um com superfície e o
//   outro sem). Onde a imagem é lisa, uma amostra basta — o MSAA da vista direta não alcança o que o raio traz.
// - Dispersão: a amostra do centro traçou só o raio do verde, com a separação estimada entre o vermelho e o azul onde
//   ele termina (`refraction_throughput.a`). Ela aparece na imagem onde passa de `REFRACTION_DISPERSION_VISIBLE` do
//   tamanho do pixel lá (a distância aos pontos vistos pelos vizinhos: na superfície, entre os pontos; de quem escapa,
//   entre as direções) e onde a imagem muda dentro do deslocamento de cada canal em relação ao verde (metade da
//   separação: as cores caem em pontos diferentes); aí as
//   amostras extras do pixel traçam os três canais (marcado também pelo antisserrilhado, nos pontos dele; só pela
//   dispersão, cada canal no centro). Onde a imagem é lisa
//   em volta, os três canais veem o mesmo: o raio do verde basta.
// Requer: refraction_marks (a lista), refraction (parâmetros), refraction_hit (leitura), refraction_accum_in (a amostra
// do centro), refraction_throughput (leitura).

/** Contraste relativo de luminância entre vizinhos acima do qual a imagem reduzida serrilha. */
const REFRACTION_CONTRAST: f32 = 0.25;
/** Separação entre o vermelho e o azul (em pixels) a partir da qual a dispersão aparece. */
const REFRACTION_DISPERSION_VISIBLE: f32 = 0.25;
/** Raio (pixels) da busca da mudança na imagem; com o deslocamento de um canal maior, a dispersão sempre. */
const REFRACTION_DISPERSION_RADIUS: f32 = 8.0;

fn refraction_luminance(pixel: vec2i) -> f32 {
    return dot(textureLoad(refraction_accum_in, pixel, 0).rgb, vec3f(0.2126, 0.7152, 0.0722));
}

/** A imagem muda entre os dois pixels com pedido: um com superfície e o outro sem, ou contraste de luminância. */
fn refraction_differs(lit: bool, lum: f32, q: vec2i, size: vec2i, same_lit_only: bool) -> bool {
    if (any(q < vec2i(0)) || any(q >= size)) { return false; }
    let n = textureLoad(refraction_hit, q, 0);
    if (n.w < 0.0) { return false; }
    if (lit != (n.w > 0.5)) { return true; }
    if (same_lit_only && !lit) { return false; }
    let other = refraction_luminance(q);
    return abs(other - lum) > REFRACTION_CONTRAST * max(max(other, lum), 1e-3);
}

/** A dispersão aparece no pixel: separação `spread` acima do visível e a imagem mudando dentro dela. */
fn refraction_disperses(pixel: vec2i, at: vec4f, lum: f32, spread: f32, size: vec2i) -> bool {
    let lit = at.w > 0.5;
    // O tamanho do pixel onde o raio termina: a menor distância aos pontos (ou direções) dos vizinhos no mesmo estado.
    var footprint = -1.0;
    for (var k = 0; k < 4; k++) {
        let q = pixel + array<vec2i, 4>(vec2i(1, 0), vec2i(-1, 0), vec2i(0, 1), vec2i(0, -1))[k];
        if (any(q < vec2i(0)) || any(q >= size)) { continue; }
        let n = textureLoad(refraction_hit, q, 0);
        if (n.w < 0.0 || lit != (n.w > 0.5)) { continue; }
        let d = distance(n.xyz, at.xyz);
        footprint = select(min(footprint, d), d, footprint < 0.0);
    }
    // Sem vizinho no mesmo estado (um pixel isolado), não há como medir: os três canais.
    if (footprint < 0.0) { return spread > 0.0; }
    let pixels = spread / max(footprint, 1e-12);
    if (pixels <= REFRACTION_DISPERSION_VISIBLE) { return false; }
    // Cada canal se afasta do verde metade da separação: a cor do pixel muda se a imagem muda dentro dessa metade.
    let shift = 0.5 * pixels;
    if (shift > REFRACTION_DISPERSION_RADIUS) { return true; }
    let radius = i32(ceil(shift));
    for (var d = 1; d <= radius; d++) {
        for (var k = 0; k < 8; k++) {
            let step = array<vec2i, 8>(
                vec2i(1, 0), vec2i(-1, 0), vec2i(0, 1), vec2i(0, -1),
                vec2i(1, 1), vec2i(-1, 1), vec2i(1, -1), vec2i(-1, -1),
            )[k];
            if (refraction_differs(lit, lum, pixel + step * d, size, false)) { return true; }
        }
    }
    return false;
}

@compute @workgroup_size(8, 8, 1)
fn refraction_footprint_main(@builtin(global_invocation_id) gid: vec3u) {
    let size = vec2i(textureDimensions(refraction_hit));
    if (any(vec2i(gid.xy) >= size)) { return; }
    let pixel = vec2i(gid.xy);
    let at = textureLoad(refraction_hit, pixel, 0);
    if (at.w < 0.0) { return; }
    let lit = at.w > 0.5;
    let lum = refraction_luminance(pixel);
    var marked = false;
    if (refraction.antialias != 0u) {
        for (var k = 0; k < 4; k++) {
            let q = pixel + array<vec2i, 4>(vec2i(1, 0), vec2i(-1, 0), vec2i(0, 1), vec2i(0, -1))[k];
            if (refraction_differs(lit, lum, q, size, true)) { marked = true; break; }
        }
    }
    // A dispersão independe do antisserrilhado: é o modelo do material.
    let spread = textureLoad(refraction_throughput, pixel, 0).a;
    let channels = spread >= 0.0 && refraction_disperses(pixel, at, lum, spread, size);
    if (marked || channels) { refraction_mark(pixel, marked, channels); }
}
