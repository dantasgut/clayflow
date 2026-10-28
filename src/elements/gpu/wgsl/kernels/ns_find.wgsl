// portado de legacy/elements/physics/gpu/wgsl/kernels/ns_find.wgsl.ts
// Posições na ordem de `sorted_particles` (escritas por `ns_sort_cells`): leitura contígua dos candidatos.

@compute @workgroup_size(WORKGROUP_SIZE)
fn ns_find_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    // Índice linear: despacho distribuído em x/y dentro do limite por dimensão (Dispatcher.invocations).
    let gid = vec3u(gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE, 0u, 0u);
    // Na ordem por célula (`by_rank`), o thread `t` busca a partícula do posto `t` e grava no posto: threads vizinhos
    // varrem as mesmas células.
    var i = gid.x;
    var slot = gid.x;
    if (ns_params.by_rank != 0u) {
        if (slot >= ns_params.particle_count) { return; }
        let ranked = ns_order[slot];
        if (ranked == 0u) { return; }
        i = ranked - 1u;
    }
    if (i >= ns_params.particle_count || !pool_live(live[i >> 5u], i)) { return; }

    let stride    = ns_params.particle_stride;
    let max_nb    = ns_params.max_neighbors;
    let h         = ns_params.cell_size;
    let h_sq      = h * h;
    let origin    = ns_params.origin;
    let cell_size = h;
    let gx        = ns_params.grid_x;
    let gy        = ns_params.grid_y;
    let gz        = ns_params.grid_z;

    let px = particle_data[i * stride + 0u];
    let py = particle_data[i * stride + 1u];
    let pz = particle_data[i * stride + 2u];

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
                    neighbor_list[nb_count * list_stride + slot] = j;
                    nb_count++;
                }
            }
        }}
    }

    neighbor_count[slot] = nb_count;
}
