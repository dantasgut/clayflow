// Luz que sai de um ponto atingido por um raio da iluminação global (spec 033, R2): a direta (as luzes com raio de
// sombra pela estrutura de raios) mais a emissão e, para os rebatimentos seguintes, a irradiância de um rebatimento das
// sondas do mundo lida no ponto. Usada pelos raios das sondas do mundo e pelos da coleta final na tela.
// Requer: gi, gi_direct, caustics_capable, gi_generation, closure, closure_eval.

/**
 * A luz direta e a emissão que saem do ponto para quem vê na direção `v`. Com as cáusticas por fótons, o especular
 * direto de vidro e metal liso fica com elas (luz → especular → difusa): o raio que o lê aqui só acharia o reflexo da
 * fonte por sorte (vaga-lumes) e contaria a mesma luz duas vezes.
 */
fn gi_shade_direct(c: Closure, p: vec3f, n: vec3f, v: vec3f, seed: u32) -> vec3f {
    var lit = c;
    if (gi.bounces.w != 0u && caustics_capable(c)) {
        lit.dielectric_weight = 0.0;
        lit.conductor_weight = 0.0;
    }
    return gi_direct(lit, p, n, v, seed) + closure_emitted(c, n, v);
}

/**
 * Os fatores da luz rebatida que sai do ponto para quem vê na direção `v` (spec 034 T078): `closure_indirect` é linear
 * na luz de cada lobo, e os rebatimentos dão a mesma irradiância a todas as direções que o fechamento lê menos o verso —
 * a luz rebatida é `front · e + back · e_verso`. A passada da luz direta os grava por raio; quem soma os rebatimentos não
 * lê o fechamento. `translucent`: o fechamento lê o verso (a irradiância do outro lado é outra leitura).
 */
struct GiShadeFactors {
    front: vec3f,
    back: vec3f,
    translucent: bool,
}

fn gi_shade_factors(c: Closure, n: vec3f, v: vec3f) -> GiShadeFactors {
    let one = vec3f(1.0);
    let zero = vec3f(0.0);
    return GiShadeFactors(
        closure_indirect(c, n, v, IndirectLight(one, zero, one, one, one)),
        closure_indirect(c, n, v, IndirectLight(zero, one, zero, zero, zero)),
        c.translucent_weight > 0.0,
    );
}

/**
 * A luz rebatida que sai do ponto com a irradiância do rebatimento `k` das sondas do mundo pelos pesos `w` (os do ponto,
 * calculados uma vez para todas as gerações), pelos fatores `f` do fechamento; o verso só quando há translúcido.
 */
fn gi_shade_indirect_weighted(f: GiShadeFactors, p: vec3f, n: vec3f, v: vec3f, w: GiGenerationWeights, k: u32) -> vec3f {
    let e = gi_generation_at(w, k) / PI;
    var back = e;
    if (f.translucent) { back = gi_generation_irradiance(k, p, -n, v) / PI; }
    return f.front * e + f.back * back;
}
