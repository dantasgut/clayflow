// O contato das gotas passadas à película (spec 034, T066d; `field_drops.wgsl`): por balde ocupado, o ponto do sólido
// e a normal dele, do array compacto da junção — a película recebe o volume ali (`field_film_absorb_main`, que tem as
// ligações do conjunto de colliders e não cabe com as do array compacto).
// A gota que cai onde a película já tem a espessura das partículas (`FIELD_FILM_FULL` na célula do contato, no quadro
// anterior) não passa a ela: ali a água é a que as partículas resolvem — o balde é esvaziado, e ela segue partícula.
// Requer: WORKGROUP_SIZE, NONE, field_items (leitura), field_contacts (leitura), field_drips, field_drops,
// FIELD_FILM_DRIPS, fluid_field, field_film, field_film_previous_read.

@compute @workgroup_size(WORKGROUP_SIZE)
fn field_absorb_prepare_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let k = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (k >= FIELD_FILM_DRIPS) { return; }
    let item = field_drop_item(atomicLoad(&field_drips[field_absorb_word(k)]));
    if (item == NONE) { return; }
    let contact = field_contacts[item];
    let n = normalize(contact.xyz + vec3f(0.0, 1e-6, 0.0));
    let q = field_items[item].xyz - n * contact.w;
    let pw = field_film_previous_word(field_film_cell(q, n), field_film_axes(n));
    if (pw != NONE && f32(field_film_previous[pw + 1u]) * FIELD_FILM_UNIT >= FIELD_FILM_FULL) {
        atomicStore(&field_drips[field_absorb_word(k)], 0u);
        return;
    }
    let o = field_absorb_contact_word(k);
    atomicStore(&field_drips[o], bitcast<u32>(q.x));
    atomicStore(&field_drips[o + 1u], bitcast<u32>(q.y));
    atomicStore(&field_drips[o + 2u], bitcast<u32>(q.z));
    atomicStore(&field_drips[o + 3u], pack4x8snorm(vec4f(n, 0.0)));
}
