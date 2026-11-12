// Deposição da película de água nos sólidos (`field_film.wgsl`, spec 034), por partícula encostada num sólido (o
// contato do solver, a menos de 1,5 raio de colisão): a película residual em cada célula do contato dela — o disco do
// raio de colisão em volta do ponto de contato, no plano do sólido (T066d: o rastro tem a largura do contato da gota,
// não a de um voxel; só onde há sólido) —, o máximo com a que já há, a normal do sólido e, se a partícula é do volume da
// água (o núcleo não é o esparso), a marca de submersa — na fatia do quadro do canal da película (T060f), depois do
// passo e do pingo.
// Requer: WORKGROUP_SIZE, fluid_field, field_common, field_film, field_film_update, field_film_solid, basis,
// field_sorted (leitura), field_sorted_contacts (leitura), field_kernel (leitura).

/** Células do raio do disco do contato no máximo (o laço tem esse teto; com a célula de um quarto de espaçamento, 2). */
const FIELD_FILM_FOOTPRINT: i32 = 4;

/** Deposita a residual e a normal (e a marca de submersa) na célula do ponto `p` do sólido de normal `n`. */
fn field_film_wet(p: vec3f, n: vec3f, packed: u32, submerged: bool) {
    let slot = field_film_find(field_film_cell(p, n), true);
    if (slot == NONE) { return; }
    let w = field_film_cell_word(slot);
    atomicMax(&field_film_cells[w + 1u], u32(FIELD_FILM_RESIDUAL / FIELD_FILM_UNIT));
    atomicStore(&field_film_cells[w + 2u], packed);
    if (submerged) { atomicStore(&field_film_cells[w + 3u], 1u); }
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn field_film_deposit_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let t = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (t >= fluid_field.sizes.x || field_sorted[t].w < 0.0) { return; }
    let contact = field_sorted_contacts[t];
    if (dot(contact.xyz, contact.xyz) <= 0.25 || contact.w >= 0.75 * fluid_field.grid.x) { return; }
    let n = normalize(contact.xyz);
    let q = field_sorted[t].xyz - n * contact.w;
    let packed = pack4x8snorm(vec4f(n, 0.0));
    let submerged = field_kernel[t * 3u + 2u].w == 0.0;
    let size = field_film_size();
    let r = fluid_field.filmShape.w;
    let reach = min(i32(ceil(r / size)), FIELD_FILM_FOOTPRINT);
    let tbn = basis_duff(n);
    field_film_wet(q, n, packed, submerged);
    for (var j = -FIELD_FILM_FOOTPRINT; j <= FIELD_FILM_FOOTPRINT; j++) {
        for (var i = -FIELD_FILM_FOOTPRINT; i <= FIELD_FILM_FOOTPRINT; i++) {
            if (abs(i) > reach || abs(j) > reach || (i == 0 && j == 0)) { continue; }
            let o = (f32(i) * tbn[0] + f32(j) * tbn[1]) * size;
            if (dot(o, o) > r * r) { continue; }
            let p = q + o;
            // Só onde há sólido: o disco que passa da quina não molha o ar.
            if (abs(field_film_solid(p)) > 0.5 * size) { continue; }
            field_film_wet(p, n, packed, submerged);
        }
    }
}
