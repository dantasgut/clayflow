// Ordena por índice as partículas de cada célula (spec 008): o espalhamento por contador atômico deixa a ordem dentro
// da célula variar entre execuções; ordenada, a busca percorre as células numa ordem fixa e a lista de vizinhos sai
// determinística sem ordenar por partícula. Também copia as posições na mesma ordem. Uma invocação por célula, inserção no próprio segmento (poucas partículas
// por célula).
// Posições na ordem por célula, para a busca ler os candidatos em sequência.

@compute @workgroup_size(WORKGROUP_SIZE)
fn ns_sort_cells_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    let cell = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    // A célula extra (a última: as partículas fora da grade) não é visitada pela busca: sem ordenar (podem ser
    // milhares, e a inserção aqui é de um thread por célula).
    if (cell + 1u >= ns_params.cell_count) { return; }
    let start = cell_start[cell];
    let count = cell_count_buf[cell];
    for (var a = 1u; a < count; a++) {
        let value = sorted_particles[start + a];
        var b = a;
        while (b > 0u && sorted_particles[start + b - 1u] > value) {
            sorted_particles[start + b] = sorted_particles[start + b - 1u];
            b--;
        }
        sorted_particles[start + b] = value;
    }
    let stride = ns_params.particle_stride;
    for (var a = 0u; a < count; a++) {
        let i = sorted_particles[start + a];
        let p = i * stride;
        sorted_positions[start + a] = vec4f(particle_data[p], particle_data[p + 1u], particle_data[p + 2u], 0.0);
        // A ordem por célula para quem roda nela (+ 1: o resto, zerado a cada reconstrução, é posto vazio).
        ns_order[start + a] = i + 1u;
    }
}
