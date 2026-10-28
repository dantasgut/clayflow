// As cáusticas no sombreamento (spec 034, T067c): a luz que chegou por um caminho especular é luz direta — a
// irradiância no hash (`caustics_irradiance`, com sinal: sob a água ela corrige a direta em linha reta) entra pela resposta do fechamento à luz que chega de todo o hemisfério
// (`closure_indirect`, a mesma da luz rebatida). O desenho a recebe em `scene_direct_lighting`; os acertos dos raios
// (a refração, a luz rebatida), em `scene_caustic_lighting`.
// Requer: caustics_gather, closure_eval.

fn caustics_lighting(c: Closure, p: vec3f, n: vec3f, v: vec3f) -> vec3f {
    let e = caustics_irradiance(p, n) / PI;
    if (all(e == vec3f(0.0))) { return vec3f(0.0); }
    return closure_indirect(c, n, v, IndirectLight(e, vec3f(0.0), e, e, e));
}
