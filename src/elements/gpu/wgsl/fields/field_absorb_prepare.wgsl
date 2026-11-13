// O contato das gotas passadas à película (spec 034, T066d; `field_drops.wgsl`): por balde ocupado, o ponto do sólido
// e a normal dele, do array compacto da junção — a película recebe o volume ali (`field_film_absorb_main`, que tem as
// ligações do conjunto de colliders e não cabe com as do array compacto).
// A gota que cai onde a película já tem a espessura das partículas (`FIELD_FILM_FULL` na célula do contato, no quadro
// anterior) não passa a ela: ali a água é a que as partículas resolvem — o balde é esvaziado, e ela segue partícula.
// O fator do espalhamento do impacto vai junto (`field_film_impact_spread`): a água que chega rápida ao sólido abre-se
// numa lâmina maior que a poça parada.
// Requer: WORKGROUP_SIZE, NONE, constants, field_items (leitura), field_contacts (leitura), field_velocities (leitura), field_drips,
// field_drops, FIELD_FILM_DRIPS, fluid_field, field_film, field_film_previous_read.

/**
 * O diâmetro máximo da lâmina que a água de diâmetro `d0` abre ao chegar ao sólido com a velocidade `speed`, em
 * diâmetros dela: 0,9 We^¼ (We = ρ v² d0 / γ; Clanet, Béguin, Richard & Quéré 2004, o impacto de gota de baixa
 * viscosidade), nunca menos que 1 (`fields/reference/film.ts`: `impactSpread`). A velocidade toda em relação ao sólido:
 * a lâmina que desliza ao longo dele espalha pelo mesmo balanço entre a inércia e a tensão da borda.
 */
fn field_film_impact_spread(speed: f32, d0: f32) -> f32 {
    let we = speed * speed * d0 / max(fluid_field.filmShape.y, 1e-12);
    return max(1.0, 0.9 * pow(we, 0.25));
}

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
    let d0 = 2.0 * pow(3.0 * fluid_field.filmShape.z / (4.0 * PI), 1.0 / 3.0);
    let spread = field_film_impact_spread(length(field_velocities[item].xyz), d0);
    atomicStore(&field_drips[o + 4u], bitcast<u32>(spread));
}
