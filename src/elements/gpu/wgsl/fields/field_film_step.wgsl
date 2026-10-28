// Um passo da película de água nos sólidos por célula (`field_film.wgsl`, spec 034), na ordem: a superfície física da
// célula (resolvida uma vez: a do sólido mais próximo), a absorção pelos poros, a evaporação e o escoamento.
// - Submersa (a água do volume esteve ali no quadro anterior): a película é a própria água — fica a residual, e os
//   poros absorvem dela.
// - Absorção (Lucas–Washburn): a água absorvida por área cresce como A² = W t, tirada da água livre, até a capacidade.
// - Evaporação (Carrier, pela temperatura da superfície e o ar da cena): primeiro a água livre; seca por cima, a dos
//   poros, mais devagar (a taxa vezes a saturação).
// - Escoamento: a borda segura parada a espessura f / (ρ g_t ℓ) (Furmidge, com a histerese ampliada pela rugosidade);
//   o excesso rompe a borda e desce ao longo do sólido na velocidade da película fina (Nusselt, freada pela
//   rugosidade) para a célula seguinte nessa direção — achada sobre a superfície do sólido (a distância aos colliders e
//   às paredes do domínio): seca, ela é criada (a água molha o que estava seco); com película, as duas se juntam. Atrás
//   fica a espessura presa. Onde o sólido acaba (uma quina), a água para.
// Requer: WORKGROUP_SIZE, NONE, fluid_field, field_common, field_film, field_film_update, collider_surface.

/** Água livre acima da qual a célula não recebe mais (m): a película já é uma gota, maior que o modelo de filme fino. */
const FIELD_FILM_MAX: f32 = 0.01;

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

/** Normal do sólido em `p`: o gradiente da distância (diferença central de um quarto de voxel). */
fn field_film_solid_normal(p: vec3f) -> vec3f {
    let e = 0.25 * field_voxel();
    return normalize(vec3f(
        field_film_solid(p + vec3f(e, 0.0, 0.0)) - field_film_solid(p - vec3f(e, 0.0, 0.0)),
        field_film_solid(p + vec3f(0.0, e, 0.0)) - field_film_solid(p - vec3f(0.0, e, 0.0)),
        field_film_solid(p + vec3f(0.0, 0.0, e)) - field_film_solid(p - vec3f(0.0, 0.0, e)),
    ) + vec3f(0.0, 1e-20, 0.0));
}

/** Espessura em unidades inteiras (arredondada). */
fn field_film_units(h: f32) -> u32 {
    return u32(max(h, 0.0) / FIELD_FILM_UNIT + 0.5);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn field_film_step_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let slot = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (slot > fluid_field.film.y) { return; }
    let w = field_film_word(slot);
    let key = atomicLoad(&field_data_atomic[w]);
    if (key == 0u) { return; }
    let dt = fluid_field.contact.z;
    let vox = field_voxel();
    let c = field_film_coords(key);
    var surface = atomicLoad(&field_data_atomic[w + 5u]);
    if (surface == 0u) {
        surface = field_film_surface_at((vec3f(c) + 0.5) * vox) + 1u;
        atomicStore(&field_data_atomic[w + 5u], surface);
    }
    // (borda / ρ, 1 / rugosidade, Washburn, capacidade) e a evaporação.
    let terms = field_film_surface(surface - 1u, 0u);
    let evaporation = field_film_surface(surface - 1u, 1u).x;
    let absorbed_units = atomicLoad(&field_data_atomic[w + 4u]);
    var absorbed = f32(absorbed_units) * FIELD_FILM_UNIT;
    // A água que os poros aceitam neste passo (Washburn: A² cresce W dt), até a capacidade.
    let soak = max(min(terms.w, sqrt(absorbed * absorbed + terms.z * dt)) - absorbed, 0.0);
    if (atomicExchange(&field_data_atomic[w + 3u], 0u) != 0u) {
        atomicStore(&field_data_atomic[w + 1u], field_film_units(FIELD_FILM_RESIDUAL));
        atomicStore(&field_data_atomic[w + 4u], absorbed_units + field_film_units(soak));
        return;
    }
    var free_units = atomicLoad(&field_data_atomic[w + 1u]);
    // Absorção, da água livre.
    let take = min(free_units, field_film_units(soak));
    free_units -= take;
    absorbed += f32(take) * FIELD_FILM_UNIT;
    // Evaporação: a água livre; o tempo que sobra depois dela seca os poros na taxa decrescente.
    let free = f32(free_units) * FIELD_FILM_UNIT;
    let dry = evaporation * dt;
    var gone = min(free_units, field_film_units(dry));
    var absorbed_after = absorbed;
    if (dry > free && evaporation > 0.0 && terms.w > 0.0) {
        let rest = (dry - free) / evaporation;
        absorbed_after = max(absorbed - evaporation * (absorbed / terms.w) * rest, 0.0);
    }
    atomicStore(&field_data_atomic[w + 4u], field_film_units(absorbed_after));
    if (take + gone > 0u) { atomicSub(&field_data_atomic[w + 1u], take + gone); }
    free_units -= gone;
    // Escoamento do excesso sobre a espessura presa.
    let h = f32(free_units) * FIELD_FILM_UNIT;
    let n = unpack4x8snorm(atomicLoad(&field_data_atomic[w + 2u])).xyz;
    let g = fluid_field.filmFlow.xyz;
    let gt = g - dot(g, n) * n;
    let gl = length(gt);
    if (gl <= 1e-3 || fluid_field.filmFlow.w <= 0.0) { return; }
    let excess = h - terms.x / (gl * vox);
    if (excess <= 0.0) { return; }
    let u = terms.y * gl * h * h / (3.0 * fluid_field.filmFlow.w);
    let moved = min(free_units, field_film_units(excess * min(1.0, u * dt / vox)));
    if (moved == 0u) { return; }
    // A célula seguinte sobre a superfície do sólido: o voxel vizinho na direção da descida, levado à superfície.
    let q = (vec3f(c + vec3i(round(gt / gl))) + 0.5) * vox;
    let d = field_film_solid(q);
    if (abs(d) > vox) { return; }
    let normal = field_film_solid_normal(q);
    let next = field_film_cell(q - d * normal, normal);
    if (all(next == c)) { return; }
    var below = field_film_find(next, false);
    if (below == NONE) {
        below = field_film_find(next, true);
        if (below == NONE) { return; }
        atomicStore(&field_data_atomic[field_film_word(below) + 2u], pack4x8snorm(vec4f(normal, 0.0)));
    }
    let bw = field_film_word(below);
    if (f32(atomicLoad(&field_data_atomic[bw + 1u])) * FIELD_FILM_UNIT >= FIELD_FILM_MAX) { return; }
    atomicSub(&field_data_atomic[w + 1u], moved);
    atomicAdd(&field_data_atomic[bw + 1u], moved);
}
