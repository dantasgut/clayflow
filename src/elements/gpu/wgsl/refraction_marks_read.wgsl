// A lista dos pixels marcados pela refração (spec 034), lida pelas amostras extras de uma rodada: o pixel da entrada
// `i` da rodada (a partir do início dela), em z 1 se marcado para a dispersão e em w 1 se para o antisserrilhado, ou
// (−1, −1, 0, 0) além do total (o último grupo do despacho indireto passa dele); e o texel do par (entrada da rodada, amostra) `e` nas
// texturas do caminho das extras (do tamanho da tela, a largura dela por linha).
// Requer: refraction_mark_list (uma camada por tipo de trabalho), refraction_mark_count (o total em (0, 0), o início da
// rodada em (1, 0), as entradas das camadas 0 e 1 em (2, 0) e (3, 0)).

fn refraction_mark_at(i: u32) -> vec4i {
    var index = textureLoad(refraction_mark_count, vec2u(1u, 0u), 0).r + i;
    if (index >= textureLoad(refraction_mark_count, vec2u(0u, 0u), 0).r) { return vec4i(-1, -1, 0, 0); }
    // As camadas em sequência: só o antisserrilhado, ele e a dispersão, só a dispersão.
    var layer = 0u;
    let n0 = textureLoad(refraction_mark_count, vec2u(2u, 0u), 0).r;
    let n1 = textureLoad(refraction_mark_count, vec2u(3u, 0u), 0).r;
    if (index >= n0) {
        index -= n0;
        layer = 1u;
        if (index >= n1) { index -= n1; layer = 2u; }
    }
    let width = textureDimensions(refraction_mark_list).x;
    let packed = textureLoad(refraction_mark_list, vec2u(index % width, index / width), layer, 0).r;
    return vec4i(i32(packed & 0xFFFFu), i32((packed >> 16u) & 0x3FFFu), i32(packed >> 31u), i32((packed >> 30u) & 1u));
}

fn refraction_aa_texel(e: u32) -> vec2u {
    let width = textureDimensions(refraction_mark_list).x;
    return vec2u(e % width, e / width);
}
