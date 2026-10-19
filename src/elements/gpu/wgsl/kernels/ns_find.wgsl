// portado de legacy/elements/physics/gpu/wgsl/kernels/ns_find.wgsl.ts
// Posições na ordem de `sorted_particles` (escritas por `ns_sort_cells`): leitura contígua dos candidatos.
// Um fio por partícula na ordem por célula (spec 034): os fios de um grupo são partículas vizinhas no espaço e leem as
// mesmas células (na ordem do pool, depois que o fluido se mistura, cada fio lia células espalhadas). A lista de cada
// partícula é a mesma (as mesmas células, na mesma ordem); a de fora da grade (no fim da ordem) fica sem vizinhos.

@compute @workgroup_size(WORKGROUP_SIZE)
fn ns_find_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    let t = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (t >= sorted_particles[arrayLength(&sorted_particles) - 1u]) { return; }
    let i = sorted_particles[t];
    // Fora da grade (a última faixa da ordem): sem vizinhos.
    if (t >= cell_start[ns_params.cell_count]) {
        neighbor_count[i] = 0u;
        return;
    }

    let max_nb    = ns_params.max_neighbors;
    let h         = ns_params.cell_size;
    let h_sq      = h * h;
    let origin    = ns_params.origin;
    let cell_size = h;
    let gx        = ns_params.grid_x;
    let gy        = ns_params.grid_y;
    let gz        = ns_params.grid_z;

    let p = sorted_positions[t].xyz;
    let px = p.x;
    let py = p.y;
    let pz = p.z;

    let ix0 = i32(floor((px - origin.x) / cell_size));
    let iy0 = i32(floor((py - origin.y) / cell_size));
    let iz0 = i32(floor((pz - origin.z) / cell_size));

    var nb_count: u32 = 0u;
    // Lista intercalada: o vizinho k de i em k * list_stride + i (contíguo entre threads vizinhas).
    let list_stride = ns_params.list_stride;
    // Cada célula já vem ordenada por índice (`ns_sort_cells`) e as células são percorridas numa ordem fixa: a lista
    // sai determinística gravada direto, sem vetor local nem ordenação por partícula.

    // Stencil 3×3×3 em 9 faixas: as 3 células vizinhas em x são contíguas na ordem por célula (mesma ordem de visita
    // de antes: dz, dy, dx crescentes).
    let x_lo = max(ix0 - 1, 0);
    let x_hi = min(ix0 + 1, i32(gx) - 1);
    if (x_lo <= x_hi) {
        for (var dz: i32 = -1; dz <= 1; dz++) {
        for (var dy: i32 = -1; dy <= 1; dy++) {
            let ny = iy0 + dy;
            let nz = iz0 + dz;
            if (ny < 0 || nz < 0 || u32(ny) >= gy || u32(nz) >= gz) { continue; }
            let row = u32(ny) * gx + u32(nz) * gx * gy;
            let first = row + u32(x_lo);
            let last = row + u32(x_hi);
            let start = cell_start[first];
            let end = cell_start[last] + cell_count_buf[last];
            for (var k: u32 = start; k < end; k++) {
                let j = sorted_particles[k];
                if (j == i) { continue; }
                let q = sorted_positions[k].xyz - vec3f(px, py, pz);
                let dist_sq = q.x * q.x + q.y * q.y + q.z * q.z;
                if (dist_sq < h_sq && nb_count < max_nb) {
                    neighbor_list[nb_count * list_stride + i] = j;
                    nb_count++;
                }
            }
        }}
    }

    neighbor_count[i] = nb_count;
}
