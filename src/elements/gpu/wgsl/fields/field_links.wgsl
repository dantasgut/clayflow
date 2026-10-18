// Vizinhança dos blocos do campo (spec 033, R11): por bloco alocado, os índices dos 27 blocos em volta (ele mesmo no
// meio; `NONE` onde não há bloco) — o redistanciamento lê os 6 das faces e a borda os diagonais.
// Requer: WORKGROUP_SIZE, NONE, fluid_field, field_common, field_lookup, field_counts (leitura), field_links_write.

/** Blocos alocados no quadro (a contagem limitada à capacidade). */
fn field_brick_count() -> u32 {
    return min(field_counts[0].count, fluid_field.sizes.y);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn field_links_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (i >= field_brick_count()) { return; }
    let b = field_brick_at(i).xyz;
    for (var k = 0u; k < 27u; k++) {
        let d = vec3i(i32(k % 3u) - 1, i32((k / 3u) % 3u) - 1, i32(k / 9u) - 1);
        field_links[i * 28u + k] = select(field_find(b + d), i, k == 13u);
    }
}
