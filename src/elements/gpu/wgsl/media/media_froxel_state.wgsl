// Se o meio contínuo (spec 041, R21: a atmosfera) conta nos froxels neste quadro e no anterior, pelo canal do alcance
// (`Froxels.reach`, spec 037): a redução da profundidade do fim do quadro anterior decide pelo quadro seguinte — a maior
// distância vista × a extinção do meio na câmera (a profundidade ótica do ar no caminho mais longo) acima de 10⁻³, ou
// névoa dos volumes na cena. Sem o alcance do quadro anterior (o canal recomeçou: `froxels.counts.w`, bit 1), conta.
// Requer: froxels, froxel_reach_prev.

/** (conta neste quadro, contava no anterior). */
fn froxel_medium_state() -> vec2<bool> {
    if ((froxels.counts.w & 2u) == 0u) { return vec2<bool>(true, true); }
    let r = textureLoad(froxel_reach_prev, vec2u(0u), 0);
    return vec2<bool>(r.y > 0.5 || froxels.counts.x > 0u, r.z > 0.5);
}
