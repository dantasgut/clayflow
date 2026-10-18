// Partículas do campo na ordem das células da grade (spec 033, R11): `field_sorted` — os núcleos, a marcação e a
// densidade leem os vizinhos de uma célula em sequência. A grade deixa de fora as partículas mortas (`w < 0`): só as
// primeiras `vivas` posições da lista das células valem (o início do último balde mais a contagem dele); as de depois
// guardam índices de quadros anteriores e viram mortas aqui — sem isso, partículas vivas saíam repetidas no lugar das
// mortas, conforme a ordem dos atômicos (imagem não determinística).
// Requer: WORKGROUP_SIZE, fluid_field, grid, cell_start, cell_count, cell_items, field_items (leitura),
// field_sorted (escrita).

@compute @workgroup_size(WORKGROUP_SIZE)
fn field_sort_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let t = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (t >= fluid_field.sizes.x) { return; }
    let live = cell_start[grid.table_mask] + cell_count[grid.table_mask];
    if (t >= live) {
        field_sorted[t] = vec4f(0.0, 0.0, 0.0, -1.0);
        return;
    }
    field_sorted[t] = field_items[cell_items[t]];
}
