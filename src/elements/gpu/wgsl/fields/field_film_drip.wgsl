// O pingo da película (spec 034, T066d): a água pendente que juntou o volume de uma partícula (`fluid_field.filmShape.z`)
// volta a ser partícula — uma das retiradas do corpo de água (as que saíram do domínio aberto ou passaram à película),
// posta parada do lado de fora do sólido: logo abaixo da célula na face de baixo, logo fora dela pela normal nas outras
// (a quina de lado), a partir do ponto da superfície do sólido mais perto do centro da célula (o centro pode estar
// dentro do sólido: no terreno inclinado do lago, a partícula da água que a célula submersa devolve ao volume nascia
// abaixo dele). O ponto a menos de um raio de outro sólido vai ao ponto livre mais perto, para fora dele; sem ponto
// livre ali, a água segue pendente na célula. Aqui a célula pede o pingo (`field_drops.wgsl`); `field_revive_main`
// escolhe a retirada pela ordem da chave e tira da célula exatamente o volume (a massa se conserva: a película vira a
// partícula). Sem retirada, a água segue pendente.
// Requer: WORKGROUP_SIZE, fluid_field, field_common, field_film, field_film_update, field_film_solid, field_drips,
// field_drops, FIELD_FILM_DRIPS.

@compute @workgroup_size(WORKGROUP_SIZE)
fn field_film_drip_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let slot = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (slot > fluid_field.film.y) { return; }
    let w = field_film_cell_word(slot);
    let key = atomicLoad(&field_film_cells[w]);
    if (key == 0u) { return; }
    let need = field_film_particle_units();
    if (need == 0u || atomicLoad(&field_film_cells[w + 6u]) < need) { return; }
    let size = field_film_size();
    let n = unpack4x8snorm(atomicLoad(&field_film_cells[w + 2u])).xyz;
    let down = normalize(fluid_field.filmFlow.xyz + vec3f(0.0, -1e-6, 0.0));
    let r = fluid_field.filmShape.w;
    let center = (vec3f(field_film_coords(key)) + 0.5) * size;
    // O ponto da superfície do sólido junto da célula (sem sólido perto, o centro dela).
    let d = field_film_solid(center);
    let base = select(center, center - d * n, abs(d) <= 1.5 * size);
    let under = dot(down, n) > 0.0;
    var p = select(base + n * (r + 0.25 * size), base + down * (r + size) + n * r, under);
    // O ponto dentro de outro sólido (a face de baixo de uma rocha apoiada no fundo do lago: o pingo nascia dentro do
    // terreno, e a colisão o expulsava com a velocidade da penetração): a partícula vai ao ponto livre mais perto — para
    // fora daquele sólido pela normal dele, a um raio da superfície. Se ali ainda não cabe (a película entre dois
    // sólidos encostados), a água segue pendente na célula.
    let clear = field_film_solid(p);
    if (clear < r) { p += field_film_solid_normal(p) * (r - clear); }
    if (field_film_solid(p) < 0.5 * r) { return; }
    let k = atomicAdd(&field_drips[field_drip_count_word()], 1u);
    if (k >= FIELD_FILM_DRIPS) { return; }
    let o = field_drip_word(k);
    atomicStore(&field_drips[o], key);
    atomicStore(&field_drips[o + 1u], w);
    atomicStore(&field_drips[o + 2u], bitcast<u32>(p.x));
    atomicStore(&field_drips[o + 3u], bitcast<u32>(p.y));
    atomicStore(&field_drips[o + 4u], bitcast<u32>(p.z));
}
