// Luz que sai de um ponto atingido por um raio da iluminação global (spec 033, R2): a direta (as luzes com raio de
// sombra pela estrutura de raios) mais a emissão e, para os rebatimentos seguintes, a irradiância de um rebatimento das
// sondas do mundo lida no ponto. Usada pelos raios das sondas do mundo e pelos da coleta final na tela.
// Requer: gi_direct, gi_generation, closure, closure_eval.

/** A luz direta e a emissão que saem do ponto para quem vê na direção `v`. */
fn gi_shade_direct(c: Closure, p: vec3f, n: vec3f, v: vec3f, seed: u32) -> vec3f {
    return gi_direct(c, p, n, v, seed) + closure_emitted(c, n, v);
}

/**
 * A luz rebatida que sai do ponto com a irradiância do rebatimento `k` das sondas do mundo em todas as direções que o
 * fechamento lê (a especular das sondas é baixa frequência); o verso só quando há translúcido.
 */
fn gi_shade_indirect(c: Closure, p: vec3f, n: vec3f, v: vec3f, k: u32) -> vec3f {
    let e = gi_generation_irradiance(k, p, n, v) / GI_PI;
    var back = e;
    if (c.translucent_weight > 0.0) { back = gi_generation_irradiance(k, p, -n, v) / GI_PI; }
    return closure_indirect(c, n, v, IndirectLight(e, back, e, e, e));
}
