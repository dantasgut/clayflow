// O espalhamento dos meios participantes nos raios da iluminação global (spec 034, T058): a névoa tira luz do que o raio
// traz (a transmitância) e devolve a que espalha no trecho — a das fontes (amostras em pontos sorteados do
// trecho, estratificados: o acerto grava o trecho, a luz direta da onda soma as fontes com sombra e fase) e a do campo de
// luz em volta. Sem isso a névoa só escurecia o que as sondas veem: as paredes de um cômodo enevoado perdiam metade da
// luz rebatida e as quinas sumiam (medido contra o traçador de caminhos com o meio).
// Requer: gi, gi_common, gi_wave_scatter.

/**
 * Grava o trecho do raio `w` da onda para o espalhamento dos meios (spec 034, T058): a origem, a direção e o comprimento
 * — a luz direta da onda (`gi_wave_direct_main`) sorteia os pontos nele e soma as fontes. `seg` ≤ 0: nada espalha (a
 * face de trás, a sonda fora da vez).
 */
fn gi_wave_scatter_put(w: u32, origin: vec3f, dir: vec3f, seg: f32) {
    gi_wave_scatter[2u * w] = vec4f(origin, bitcast<f32>(pack2x16snorm(gi_oct_encode(dir))));
    gi_wave_scatter[2u * w + 1u] = vec4f(seg, 0.0, 0.0, 0.0);
}

/**
 * A luz de um raio que atravessou os meios (T058): a do fim dele pela transmitância, a parte espalhada dela que o meio
 * devolve para o raio (o campo de luz em volta, aproximado pela do próprio raio: (1 − T) · albedo) e a das fontes
 * espalhada no trecho (`scatter`, da luz direta da onda).
 */
fn gi_through(l: vec3f, through: vec3f, scatter: vec4f) -> vec3f {
    return l * (through + (vec3f(1.0) - through) * scatter.w) + scatter.rgb;
}

