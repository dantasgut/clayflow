// As vistas de sombra do quadro no estágio de sombra (spec 013): o atlas é um só e cada vista viva (um referencial,
// `ShadowMatrix`) tem a sua faixa. Os parâmetros do estágio (`sp`) trazem, pelo índice da vista (a faixa dela no atlas),
// se ela está viva (`liveMask`), o slot do referencial dela no pool `ShadowMatrix` (`views0..3`) e se o cache dela
// recomeça por ordem da CPU (`resetMask`: a faixa mudou de dono). Comum aos kernels das páginas e ao desenho delas.
// Requer: shadow_virtual, `sp` (ShadowPagesParams), `shadow_matrices`.

/** A vista `v` está viva (tem mapa e referencial)? */
fn sp_view_live(v: u32) -> bool {
    return ((sp.liveMask >> v) & 1u) != 0u;
}

/** O slot do referencial da vista `v` no pool `ShadowMatrix`. */
fn sp_view_slot(v: u32) -> u32 {
    let q = (v >> 2u) & 3u;
    let row = select(select(select(sp.views0, sp.views1, q == 1u), sp.views2, q == 2u), sp.views3, q == 3u);
    return row[v & 3u];
}

/** Qual das vistas do referencial a vista `v` é: 0 no de uma vista; a face do cubo na luz pontual. */
fn sp_view_face(v: u32) -> u32 {
    return (select(sp.faces0, sp.faces1, v >= 8u) >> ((v & 7u) * 4u)) & 0xFu;
}

/** O referencial da vista `v` no quadro (o da face dela, no referencial de várias vistas). */
fn sp_view_matrix(v: u32) -> ShadowMatrix {
    return sv_face(shadow_matrices[sp_view_slot(v)], sp_view_face(v));
}

/**
 * O cache da vista não vale neste quadro: o estágio recomeça (os grupos mudaram, a série dos retângulos parou), a faixa
 * mudou de dono, ou o referencial dela mudou (`direction.w`: a luz girou além do limiar, o nível, a série).
 */
fn sp_view_reset(v: u32, m: ShadowMatrix) -> bool {
    return sp.reset != 0u || ((sp.resetMask >> v) & 1u) != 0u || m.direction.w != 0.0;
}

/** Palavra do texel `t` (0..129, com a borda) da página física `phys` no atlas (o reservatório comum às vistas). */
fn sp_atlas_word(phys: u32, t: vec2u) -> u32 {
    return sp.pagesBase + phys * SV_STRIDE * SV_STRIDE + t.y * SV_STRIDE + t.x;
}
