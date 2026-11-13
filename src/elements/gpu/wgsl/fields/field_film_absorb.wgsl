// A gota que desliza passada à película (spec 034, T066d): a gota solta encostada num sólido que o ancoramento não
// parou (o solver a marca, `fluid_drop_state`; a junção a põe num balde, `field_drops.wgsl`) é água abaixo da resolução das
// partículas — a de uma partícula sobre um sólido se abre numa poça mais fina que ela, ou escorre como filete. O volume
// dela entra na película na poça em que se abre: o disco da espessura que a linha de contato segura contra o peso
// normal à superfície, √(2 f / (ρ g_n)), até a película mais grossa do modelo (na parede, ela), com a água de cada célula
// pela cobertura do disco (a borda redonda); o disco até o alcance do laço (a poça maior começa menor e espalha). Só as
// células sobre o sólido recebem (na quina a poça não passa ao ar); a conta é inteira, nas unidades da pendente (as do
// pingo, a conta inversa): a parte de cada célula e o resto do arredondamento na célula do contato — a película ganha
// exatamente o que a partícula tinha. Daí em diante é a física da película: escorre (deixando atrás a espessura que a
// borda segura: o rastro), espalha, evapora, entra nos poros e pinga. Na fatia do quadro do canal da película, depois do
// passo (`fields/reference/film.ts`: `absorbUnits`). Um grupo por gota: as colunas da poça repartidas entre as
// invocações (o peso de cada uma medido uma vez, na memória do grupo).
// Requer: WORKGROUP_SIZE, NONE, constants, fluid_field, field_common, field_film, field_film_update, field_film_solid,
// field_drips_read, field_drops, FIELD_FILM_DRIPS (o contato de cada gota, `field_absorb_prepare_main`).

/** Células do raio da poça no máximo (o laço tem esse teto: 17 × 17 colunas). */
const FIELD_FILM_ABSORB: i32 = 8;
/** Colunas da poça no máximo. */
const FIELD_FILM_ABSORB_COLUMNS: u32 = 289u;
var<workgroup> field_absorb_weights: array<f32, FIELD_FILM_ABSORB_COLUMNS>;
// Uma parcela por invocação do grupo (o grupo é uma gota).
var<workgroup> field_absorb_sums: array<f32, WORKGROUP_SIZE>;
var<workgroup> field_absorb_given: array<u32, WORKGROUP_SIZE>;

/** A coluna `index` (0 … 288) da poça, em volta da coluna `home` do contato. */
fn field_film_absorb_column(home: vec2i, index: u32) -> vec2i {
    let side = 2 * FIELD_FILM_ABSORB + 1;
    return home + vec2i(i32(index) % side - FIELD_FILM_ABSORB, i32(index) / side - FIELD_FILM_ABSORB);
}

/** O peso da coluna `uv` na poça de raio `radius` em volta de `q` (0 fora dela ou fora do sólido). */
fn field_film_absorb_weight(q: vec3f, n: vec3f, axes: vec2i, uv: vec2i, radius: f32) -> f32 {
    let at = field_film_plane_cell(q, n, axes, uv);
    let cover = field_film_coverage(length(at.point - q), radius);
    if (cover <= 0.0) { return 0.0; }
    let size = field_film_size();
    if (abs(field_film_solid((vec3f(at.cell) + 0.5) * size)) > size) { return 0.0; }
    return cover;
}

/**
 * Soma `units` da pendente (como água livre) à célula `c` (no plano dos eixos `axes`), que nasce com a normal `packed`;
 * falso sem lugar na tabela.
 */
fn field_film_absorb_add(c: vec3i, axes: vec2i, packed: u32, units: u32) -> bool {
    if (units == 0u) { return true; }
    let slot = field_film_find(c, axes, true);
    if (slot == NONE) { return false; }
    let w = field_film_cell_word(slot);
    atomicMax(&field_film_cells[w + 2u], packed);
    atomicAdd(&field_film_cells[w + 1u], units * FIELD_FILM_DROP_UNITS);
    return true;
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn field_film_absorb_main(
    @builtin(workgroup_id) group: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
    @builtin(local_invocation_index) lane: u32,
) {
    let k = group.x + group.y * nwg.x;
    let item = field_drop_item(field_drips_read[field_absorb_word(min(k, FIELD_FILM_DRIPS - 1u))]);
    let live = k < FIELD_FILM_DRIPS && item != NONE;
    let c = field_absorb_contact_word(min(k, FIELD_FILM_DRIPS - 1u));
    let q = vec3f(
        bitcast<f32>(field_drips_read[c]),
        bitcast<f32>(field_drips_read[c + 1u]),
        bitcast<f32>(field_drips_read[c + 2u]),
    );
    let packed = field_drips_read[c + 3u];
    let n = normalize(unpack4x8snorm(packed).xyz + vec3f(0.0, 1e-6, 0.0));
    let size = field_film_size();
    // O volume da partícula nas unidades da pendente (a mesma conta do pingo).
    let units = field_film_particle_units();
    // A poça: a espessura que a borda segura contra o peso normal (a superfície do sólido do contato).
    let hold = field_film_surface(field_film_surface_at(q), 0u).x;
    let gn = max(-dot(fluid_field.filmFlow.xyz, n), 0.0);
    let thickness = select(FIELD_FILM_MAX, min(FIELD_FILM_MAX, sqrt(2.0 * hold / gn)), gn > 1e-3);
    // O disco inteiro dentro do alcance do laço (a poça maior que ele começa menor e mais grossa, e espalha pela física
    // da película): cortado pelo quadrado do laço, ela sairia quadrada.
    let radius = min(
        sqrt(fluid_field.filmShape.z / (PI * max(thickness, 1e-9))),
        (f32(FIELD_FILM_ABSORB) - 0.5) * size,
    );
    let reach = min(i32(ceil(radius / size + 0.5)), FIELD_FILM_ABSORB);
    let axes = field_film_axes(n);
    let center = field_film_cell(q, n);
    let home = vec2i(center[axes.x], center[axes.y]);
    // O peso de cada coluna, uma vez; a soma das de cada invocação.
    var sum = 0.0;
    for (var c = lane; c < FIELD_FILM_ABSORB_COLUMNS; c += WORKGROUP_SIZE) {
        let d = field_film_absorb_column(home, c) - home;
        var wgt = 0.0;
        if (live && abs(d.x) <= reach && abs(d.y) <= reach) {
            wgt = field_film_absorb_weight(q, n, axes, home + d, radius);
        }
        field_absorb_weights[c] = wgt;
        sum += wgt;
    }
    field_absorb_sums[lane] = sum;
    workgroupBarrier();
    // A soma de todas, na mesma ordem em todas as invocações (o resultado igual em cada uma).
    var total = 0.0;
    for (var i = 0u; i < WORKGROUP_SIZE; i++) { total += field_absorb_sums[i]; }
    // A parte inteira de cada coluna.
    var given = 0u;
    if (live && total > 0.0) {
        for (var c = lane; c < FIELD_FILM_ABSORB_COLUMNS; c += WORKGROUP_SIZE) {
            let wgt = field_absorb_weights[c];
            if (wgt <= 0.0) { continue; }
            // Um pouco abaixo da fração (o f32 da soma): as partes nunca passam do volume, o resto vai ao contato.
            let part = u32(floor(f32(units) * (wgt / total) * 0.99999));
            let cell = field_film_plane_cell(q, n, axes, field_film_absorb_column(home, c)).cell;
            if (field_film_absorb_add(cell, axes, packed, part)) { given += part; }
        }
    }
    field_absorb_given[lane] = given;
    workgroupBarrier();
    // O resto do arredondamento na célula do contato.
    if (live && lane == 0u) {
        var sum_given = 0u;
        for (var i = 0u; i < WORKGROUP_SIZE; i++) { sum_given += field_absorb_given[i]; }
        field_film_absorb_add(center, axes, packed, units - min(sum_given, units));
    }
}
