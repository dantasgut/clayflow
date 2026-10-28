// Deposição da película de água nos sólidos (`field_film.wgsl`, spec 034), por partícula encostada num sólido (o
// contato do solver, a menos de 1,5 raio de colisão): a película residual na célula do ponto de contato (o máximo com a
// que já há), a normal do sólido e, se a partícula é do volume da água (o núcleo não é o esparso), a marca de submersa.
// Requer: WORKGROUP_SIZE, fluid_field, field_common, field_film, field_film_update, field_sorted (leitura),
// field_sorted_contacts (leitura), field_kernel (leitura).

@compute @workgroup_size(WORKGROUP_SIZE)
fn field_film_deposit_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let t = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (t >= fluid_field.sizes.x || field_sorted[t].w < 0.0) { return; }
    let contact = field_sorted_contacts[t];
    if (dot(contact.xyz, contact.xyz) <= 0.25 || contact.w >= 0.75 * fluid_field.grid.x) { return; }
    let n = normalize(contact.xyz);
    let q = field_sorted[t].xyz - n * contact.w;
    let slot = field_film_find(field_film_cell(q, n), true);
    if (slot == NONE) { return; }
    let w = field_film_word(slot);
    atomicMax(&field_data_atomic[w + 1u], u32(FIELD_FILM_RESIDUAL / FIELD_FILM_UNIT));
    atomicStore(&field_data_atomic[w + 2u], pack4x8snorm(vec4f(n, 0.0)));
    if (field_kernel[t * 3u + 2u].w == 0.0) { atomicStore(&field_data_atomic[w + 3u], 1u); }
}
