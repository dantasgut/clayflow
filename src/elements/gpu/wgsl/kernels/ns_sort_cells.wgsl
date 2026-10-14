// Ordena por índice as partículas de cada célula (spec 008): o espalhamento por contador atômico deixa a ordem dentro
// da célula variar entre execuções; ordenada, a busca percorre as células numa ordem fixa e a lista de vizinhos sai
// determinística sem ordenar por partícula. Também copia as posições na mesma ordem. Uma invocação por célula, inserção no próprio segmento (poucas partículas
// por célula).
@group(0) @binding(0) var<uniform>             ns_params:        NsSimParams;
@group(1) @binding(0) var<storage, read>       cell_start:       array<u32>;
@group(1) @binding(1) var<storage, read>       cell_count_buf:   array<u32>;
@group(1) @binding(2) var<storage, read_write> sorted_particles: array<u32>;
@group(1) @binding(3) var<storage, read>       particle_data:    array<f32>;
// Posições na ordem por célula, para a busca ler os candidatos em sequência.
@group(1) @binding(4) var<storage, read_write> sorted_positions: array<vec4f>;

@compute @workgroup_size(64)
fn ns_sort_cells_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    let cell = gid3.x + gid3.y * nwg.x * 64u;
    if (cell >= ns_params.cell_count) { return; }
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
        let p = sorted_particles[start + a] * stride;
        sorted_positions[start + a] = vec4f(particle_data[p], particle_data[p + 1u], particle_data[p + 2u], 0.0);
    }
}
