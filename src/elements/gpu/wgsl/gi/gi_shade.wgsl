// Luz que sai de um ponto atingido por um raio da iluminação global (spec 033, R2): a direta (as luzes com raio de
// sombra pela estrutura de raios) mais a emissão e, para os rebatimentos seguintes, a irradiância de um rebatimento das
// sondas do mundo lida no ponto. Usada pelos raios das sondas do mundo e pelos da coleta final na tela.
// Requer: gi, gi_direct (gi_photon_caustic_capable), gi_generation, closure, closure_eval.

/**
 * A luz direta e a emissão que saem do ponto para quem vê na direção `v`. Com as cáusticas por fótons, o especular
 * direto de vidro e metal liso fica com elas (luz → especular → difusa): o raio que o lê aqui só acharia o reflexo da
 * fonte por sorte (vaga-lumes) e contaria a mesma luz duas vezes.
 */
fn gi_shade_direct(c: Closure, p: vec3f, n: vec3f, v: vec3f, seed: u32) -> vec3f {
    var lit = c;
    if (gi.bounces.w != 0u && gi_photon_caustic_capable(c)) {
        lit.dielectric_weight = 0.0;
        lit.conductor_weight = 0.0;
    }
    return gi_direct(lit, p, n, v, seed) + closure_emitted(c, n, v);
}

/**
 * A luz rebatida que sai do ponto com a irradiância do rebatimento `k` das sondas do mundo pelos pesos `w` (os do ponto,
 * calculados uma vez para todas as gerações) em todas as direções que o fechamento lê (a especular das sondas é baixa
 * frequência); o verso só quando há translúcido.
 */
fn gi_shade_indirect_weighted(c: Closure, p: vec3f, n: vec3f, v: vec3f, w: GiGenerationWeights, k: u32) -> vec3f {
    let e = gi_generation_at(w, k) / PI;
    var back = e;
    if (c.translucent_weight > 0.0) { back = gi_generation_irradiance(k, p, -n, v) / PI; }
    return closure_indirect(c, n, v, IndirectLight(e, back, e, e, e));
}

/** A luz rebatida do rebatimento `k` das sondas do mundo no ponto (os pesos calculados aqui). */
fn gi_shade_indirect(c: Closure, p: vec3f, n: vec3f, v: vec3f, k: u32) -> vec3f {
    return gi_shade_indirect_weighted(c, p, n, v, gi_generation_weights(p, n, v), k);
}
