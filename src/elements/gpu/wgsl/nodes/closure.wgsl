// Nós de composição de fechamentos (spec 011, R5): mistura, soma, camada, filme fino, opacidade e normal própria. A
// regra de fusão dos lobos do mesmo tipo é a de `closure_add`.
// Requer: closure.

fn node_closure_mix(a: Closure, b: Closure, t: f32) -> Closure {
    return closure_mix(a, b, t);
}

fn node_closure_add(a: Closure, b: Closure) -> Closure {
    return closure_add(a, b);
}

fn node_closure_layer(top: Closure, base: Closure, top_color: vec3f, top_weight: f32) -> Closure {
    return closure_layer(top, base, top_color, top_weight);
}

fn node_closure_thin_film(c: Closure, thickness: f32, ior: f32) -> Closure {
    return closure_thin_film(c, thickness, ior);
}

fn node_closure_opacity(c: Closure, alpha: f32) -> Closure {
    return closure_opacity(c, alpha);
}

fn node_closure_normal(c: Closure, normal: vec3f) -> Closure {
    return closure_normal(c, normal);
}
