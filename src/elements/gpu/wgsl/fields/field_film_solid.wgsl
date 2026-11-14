// Os sólidos da película de água (`field_film.wgsl`, spec 034): a distância com sinal ao sólido mais próximo — os
// colliders e as paredes do domínio —, a normal dele e a superfície física dele. O passo da película desce e espalha a
// água sobre eles; a deposição só molha onde há sólido; o pingo sai de onde ele acaba.
// Requer: fluid_field, field_common, field_film, collider_surface.

/** Distância das paredes do domínio (o chão e os quatro lados; 3e38 no domínio aberto). */
fn field_film_walls(p: vec3f) -> f32 {
    if (fluid_field.filmBoundsMin.w < 0.5) { return 3.0e38; }
    let lo = fluid_field.filmBoundsMin.xyz;
    let hi = fluid_field.filmBoundsMax.xyz;
    return min(p.y - lo.y, min(min(p.x - lo.x, hi.x - p.x), min(p.z - lo.z, hi.z - p.z)));
}

/** Distância com sinal ao sólido mais próximo: os colliders e as paredes do domínio. */
fn field_film_solid(p: vec3f) -> f32 {
    return min(collider_set_distance(p), field_film_walls(p));
}

/** A entrada da tabela das superfícies no ponto `p`: a do collider mais próximo, ou a padrão junto a uma parede. */
fn field_film_surface_at(p: vec3f) -> u32 {
    if (field_film_walls(p) < collider_set_distance(p)) { return 0u; }
    return collider_set_surface(p);
}

/** Normal do sólido em `p`: o gradiente da distância (diferença central de um quarto de célula). */
fn field_film_solid_normal(p: vec3f) -> vec3f {
    let e = 0.25 * field_film_size();
    return normalize(vec3f(
        field_film_solid(p + vec3f(e, 0.0, 0.0)) - field_film_solid(p - vec3f(e, 0.0, 0.0)),
        field_film_solid(p + vec3f(0.0, e, 0.0)) - field_film_solid(p - vec3f(0.0, e, 0.0)),
        field_film_solid(p + vec3f(0.0, 0.0, e)) - field_film_solid(p - vec3f(0.0, 0.0, e)),
    ) + vec3f(0.0, 1e-20, 0.0));
}
