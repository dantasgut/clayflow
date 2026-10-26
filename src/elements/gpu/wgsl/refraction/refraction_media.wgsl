// Pilha de meios de um caminho (spec 034, R1, T043) — as regras da referência da CPU: até `REFRACTION_MAX_MEDIA` meios
// em registradores, por entidade (instância da estrutura de raios); o meio corrente é o de maior prioridade
// (`transmission_priority`), no empate o último em que se entrou; sem meio, o ar (índice 1, sem absorção). Cruzar a
// borda de um meio que não é o corrente nem passa a ser não é interface (o raio segue). Absorção de Beer–Lambert pelo
// percurso no meio corrente: σ = −ln(cor) / profundidade por canal (a cor atingida a `transmission_depth`). O índice
// por canal vem do número de Abbe (`closure_dispersion_iors`): o canal −1 (os três juntos) usa o da linha d (verde).
// Requer: NONE, closure, REFRACTION_MAX_MEDIA.

/** Um meio da pilha: a instância, a prioridade, o índice por canal e a absorção por canal. */
struct RefractionMedium {
    instance: u32,
    priority: f32,
    ior: vec3f,
    sigma: vec3f,
}

/** Pilha de meios: em ordem de entrada; `overflow` 1 quando um meio além do teto não coube. */
struct RefractionStack {
    media: array<RefractionMedium, REFRACTION_MAX_MEDIA>,
    count: u32,
    overflow: u32,
}

fn refraction_air() -> RefractionMedium {
    return RefractionMedium(NONE, -1e30, vec3f(1.0), vec3f(0.0));
}

fn refraction_empty_stack() -> RefractionStack {
    var s: RefractionStack;
    s.count = 0u;
    s.overflow = 0u;
    return s;
}

/** O meio do fechamento `c` da instância `instance`. */
fn refraction_medium(c: Closure, instance: u32) -> RefractionMedium {
    return RefractionMedium(
        instance,
        c.transmission_priority,
        closure_dispersion_iors(c.transmission_ior, c.transmission_abbe),
        closure_absorption(c),
    );
}

/** O meio corrente (o de maior prioridade; no empate, o último em que se entrou), ou o ar. */
fn refraction_current(s: RefractionStack) -> RefractionMedium {
    var best = refraction_air();
    for (var i = 0u; i < s.count; i++) {
        if (best.instance == NONE || s.media[i].priority >= best.priority) { best = s.media[i]; }
    }
    return best;
}

fn refraction_contains(s: RefractionStack, instance: u32) -> bool {
    for (var i = 0u; i < s.count; i++) {
        if (s.media[i].instance == instance) { return true; }
    }
    return false;
}

/** Entra no meio `m` (se ainda não está nele; além do teto, marca `overflow`). */
fn refraction_enter(s: RefractionStack, m: RefractionMedium) -> RefractionStack {
    var out = s;
    if (refraction_contains(s, m.instance)) { return out; }
    if (out.count >= REFRACTION_MAX_MEDIA) {
        out.overflow = 1u;
        return out;
    }
    out.media[out.count] = m;
    out.count += 1u;
    return out;
}

/** Sai do meio da instância `instance` (a ordem dos outros fica). */
fn refraction_leave(s: RefractionStack, instance: u32) -> RefractionStack {
    var out = refraction_empty_stack();
    out.overflow = s.overflow;
    for (var i = 0u; i < s.count; i++) {
        if (s.media[i].instance == instance) { continue; }
        out.media[out.count] = s.media[i];
        out.count += 1u;
    }
    return out;
}

/** Cruzar a borda de uma instância: sair dela (`leaving`) ou entrar no meio `medium` (o dela). */
struct RefractionCross {
    medium: RefractionMedium,
    leaving: bool,
}

/** A pilha `s` depois do cruzamento `x`. */
fn refraction_applied(s: RefractionStack, x: RefractionCross) -> RefractionStack {
    if (x.leaving) { return refraction_leave(s, x.medium.instance); }
    return refraction_enter(s, x.medium);
}

/** Índice do meio no canal (−1: o da linha d). */
fn refraction_ior(m: RefractionMedium, channel: i32) -> f32 {
    if (channel < 0) { return m.ior.y; }
    return m.ior[channel];
}

/** O meio separa os canais (número de Abbe > 0)? */
fn refraction_dispersive(m: RefractionMedium) -> bool {
    return m.ior.x != m.ior.z;
}

/** A energia que resta depois de `t` de percurso no meio `m` (os canais sem absorção não mudam, mesmo com t infinito). */
fn refraction_absorb(throughput: vec3f, m: RefractionMedium, t: f32) -> vec3f {
    return select(throughput, throughput * exp(-m.sigma * t), m.sigma > vec3f(0.0));
}
