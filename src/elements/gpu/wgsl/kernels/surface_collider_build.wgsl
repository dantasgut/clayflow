// Construção de um colisor de superfície (spec 010), passadas 2 em diante, por cópia (em sequência no índice linear): zerar o rascunho; cabeçalho
// (caixa local, inversa do mundo, matriz normal, escala, cópias construídas); altura (rasterização dos triângulos da
// amostragem nos nós xz com atomicMax e decodificação) ou distância com sinal (semeadura exata perto dos triângulos com
// atomicMin dos bits e depois do id, jump flooding 3D em ping-pong, distância final exata com o sinal pela normal
// interpolada no ponto mais próximo). Todos os atômicos são de ordem total: o campo não depende da ordem das threads.
// Layout do campo: ver `surface_collider_hit.wgsl`.
// Requer: structs SurfaceBakeParams, WorldTransform; surface_collider_common; linalg.

const SCB_HEADER: u32 = 64u;
// Nós por eixo que um triângulo pode cobrir (amostragem muito mais grossa que o campo: o excesso é ignorado).
const SCB_MAX_SPAN: u32 = 64u;

fn scb_base(k: u32) -> u32 {
    return bake.field_first + k * bake.copy_stride;
}

fn scb_lo(k: u32) -> vec3f {
    let b = scb_base(k);
    return vec3f(bake_field[b], bake_field[b + 1u], bake_field[b + 2u]);
}

fn scb_hi(k: u32) -> vec3f {
    let b = scb_base(k);
    return vec3f(bake_field[b + 4u], bake_field[b + 5u], bake_field[b + 6u]);
}

fn scb_dims() -> vec3u {
    return vec3u(bake.nx, bake.ny, bake.nz);
}

// Posição local do nó (ix, iy, iz) da cópia k.
fn scb_node(k: u32, idx: vec3u) -> vec3f {
    let lo = scb_lo(k);
    let n = vec3f(max(scb_dims(), vec3u(2u)) - vec3u(1u));
    return lo + vec3f(idx) * (scb_hi(k) - lo) / n;
}

fn scb_cell_index(idx: vec3u) -> u32 {
    return idx.x + bake.nx * (idx.y + bake.ny * idx.z);
}

fn scb_cell_coords(i: u32) -> vec3u {
    return vec3u(i % bake.nx, (i / bake.nx) % bake.ny, i / (bake.nx * bake.ny));
}

fn scb_point(k: u32, s: u32) -> vec4f {
    return bake_points[(k * bake.samples + s) * 2u];
}

fn scb_normal(k: u32, s: u32) -> vec3f {
    return bake_points[(k * bake.samples + s) * 2u + 1u].xyz;
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn scb_clear_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let it = scb_item(gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE, max(bake.cells, 8u));
    let i = it.i;
    let k = it.k;
    if (k >= bake.copies) { return; }
    if (i < 8u) {
        atomicStore(&bake_bounds[k * 8u + i], select(0u, SCB_NONE, i < 4u));
    }
    if (i >= bake.cells) { return; }
    // Altura: 0 fica abaixo de toda altura codificada; distância: +∞ (bits positivos em ordem).
    atomicStore(&bake_cells[k * bake.cells + i], select(0x7F800000u, 0u, bake.mode == 0u));
    if (bake.mode == 1u) {
        atomicStore(&bake_ids[(k * 2u) * bake.cells + i], SCB_NONE);
        atomicStore(&bake_ids[(k * 2u + 1u) * bake.cells + i], SCB_NONE);
    }
}

// Uma thread por cópia: caixa (com banda no modo distância), matrizes e escala.
@compute @workgroup_size(WORKGROUP_SIZE)
fn scb_header_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let k = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (k >= bake.copies) { return; }
    let b = k * 8u;
    var lo = vec3f(
        scb_unorder(atomicLoad(&bake_bounds[b])),
        scb_unorder(atomicLoad(&bake_bounds[b + 1u])),
        scb_unorder(atomicLoad(&bake_bounds[b + 2u])),
    );
    var hi = vec3f(
        scb_unorder(atomicLoad(&bake_bounds[b + 4u])),
        scb_unorder(atomicLoad(&bake_bounds[b + 5u])),
        scb_unorder(atomicLoad(&bake_bounds[b + 6u])),
    );
    let empty = !(all(lo <= hi));
    if (empty) {
        lo = vec3f(0.0);
        hi = vec3f(0.0);
    }
    if (bake.mode == 1u) {
        // Eixo achatado (plano) ganha espessura; a banda deixa células de folga em volta.
        let ext = hi - lo;
        let m = max(max(ext.x, ext.y), max(ext.z, 1e-3));
        let e = max(ext, vec3f(0.05 * m));
        let mid = 0.5 * (lo + hi);
        let inner = vec3f(max(scb_dims(), vec3u(2u * bake.band + 2u)) - vec3u(1u + 2u * bake.band));
        let cell = e / inner;
        lo = mid - 0.5 * e - f32(bake.band) * cell;
        hi = mid + 0.5 * e + f32(bake.band) * cell;
    }
    var world = bake.world;
    var normal_m = mat3x3f(bake.normal0.xyz, bake.normal1.xyz, bake.normal2.xyz);
    if (bake.use_world_pool != 0u && bake.transform_slot != SCB_NONE) {
        world = bake_worlds[bake.transform_slot].world;
        normal_m = bake_worlds[bake.transform_slot].normal;
    }
    if (abs(mat3_det(affine_linear(world))) <= AFFINE_SINGULAR_DET) {
        // Mundo ainda não calculado (primeiro quadro) ou singular: identidade.
        world = mat4x4f(vec4f(1.0, 0.0, 0.0, 0.0), vec4f(0.0, 1.0, 0.0, 0.0), vec4f(0.0, 0.0, 1.0, 0.0), vec4f(0.0, 0.0, 0.0, 1.0));
        normal_m = mat3x3f(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), vec3f(0.0, 0.0, 1.0));
    }
    let m3 = affine_linear(world);
    let inv = affine_inverse(world);
    let inv3 = affine_linear(inv);
    let t = inv[3].xyz;
    let base = scb_base(k);
    bake_field[base] = lo.x;
    bake_field[base + 1u] = lo.y;
    bake_field[base + 2u] = lo.z;
    bake_field[base + 3u] = 0.0;
    bake_field[base + 4u] = hi.x;
    bake_field[base + 5u] = hi.y;
    bake_field[base + 6u] = hi.z;
    bake_field[base + 7u] = 0.0;
    for (var c = 0u; c < 3u; c++) {
        bake_field[base + 8u + 4u * c] = inv3[c].x;
        bake_field[base + 9u + 4u * c] = inv3[c].y;
        bake_field[base + 10u + 4u * c] = inv3[c].z;
        bake_field[base + 11u + 4u * c] = 0.0;
        bake_field[base + 24u + 4u * c] = normal_m[c].x;
        bake_field[base + 25u + 4u * c] = normal_m[c].y;
        bake_field[base + 26u + 4u * c] = normal_m[c].z;
        bake_field[base + 27u + 4u * c] = 0.0;
    }
    bake_field[base + 20u] = t.x;
    bake_field[base + 21u] = t.y;
    bake_field[base + 22u] = t.z;
    bake_field[base + 23u] = 1.0;
    bake_field[base + 36u] = min(min(length(m3[0]), length(m3[1])), length(m3[2]));
    // Cópias construídas (na cópia 0); sem amostra válida, nenhuma (a consulta não colide).
    // Tempos das cópias (fim de cada passo), para a consulta escolher a do passo do solver.
    if (k == 0u) {
        bake_field[base + 37u] = bitcast<f32>(select(bake.copies, 0u, empty));
        for (var j = 0u; j < 16u; j++) { bake_field[base + 40u + j] = scb_time(j); }
        bake_field[base + 56u] = bitcast<f32>(bake.nx);
        bake_field[base + 57u] = bitcast<f32>(bake.ny);
        bake_field[base + 58u] = bitcast<f32>(bake.nz);
        bake_field[base + 59u] = bitcast<f32>(bake.copy_stride);
        bake_field[base + 60u] = bitcast<f32>(bake.mode);
        bake_field[base + 61u] = bake.margin;
    }
}

// Altura: cada triângulo da amostragem escreve nos nós xz que cobre a altura interpolada (máximo entre triângulos).
@compute @workgroup_size(WORKGROUP_SIZE)
fn scb_height_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let it = scb_item(gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE, bake.tris);
    let t = it.i;
    let k = it.k;
    if (k >= bake.copies) { return; }
    let s = scb_triangle(t);
    let a = scb_point(k, s.x);
    let b = scb_point(k, s.y);
    let c = scb_point(k, s.z);
    if (a.w == 0.0 || b.w == 0.0 || c.w == 0.0) { return; }
    let lo = scb_lo(k);
    let n = vec2f(f32(bake.nx - 1u), f32(bake.nz - 1u));
    let scale = n / max((scb_hi(k) - lo).xz, vec2f(1e-12));
    let ga = (a.xz - lo.xz) * scale;
    let gb = (b.xz - lo.xz) * scale;
    let gc = (c.xz - lo.xz) * scale;
    let det = (gb.x - ga.x) * (gc.y - ga.y) - (gc.x - ga.x) * (gb.y - ga.y);
    if (abs(det) <= 1e-12) { return; }
    let mn = max(ceil(min(min(ga, gb), gc) - vec2f(1e-4)), vec2f(0.0));
    let mx = min(floor(max(max(ga, gb), gc) + vec2f(1e-4)), n);
    if (any(mn > mx)) { return; }
    let i0 = vec2u(mn);
    let i1 = min(vec2u(mx), i0 + vec2u(SCB_MAX_SPAN - 1u));
    for (var iz = i0.y; iz <= i1.y; iz++) {
        for (var ix = i0.x; ix <= i1.x; ix++) {
            let g = vec2f(f32(ix), f32(iz));
            let wb = ((g.x - ga.x) * (gc.y - ga.y) - (gc.x - ga.x) * (g.y - ga.y)) / det;
            let wc = ((gb.x - ga.x) * (g.y - ga.y) - (g.x - ga.x) * (gb.y - ga.y)) / det;
            let wa = 1.0 - wb - wc;
            if (min(wa, min(wb, wc)) < -1e-4) { continue; }
            let h = wa * a.y + wb * b.y + wc * c.y;
            atomicMax(&bake_cells[k * bake.cells + ix + bake.nx * iz], scb_order(h));
        }
    }
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn scb_height_finish_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let it = scb_item(gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE, bake.cells);
    let i = it.i;
    let k = it.k;
    if (k >= bake.copies) { return; }
    let u = atomicLoad(&bake_cells[k * bake.cells + i]);
    bake_field[scb_base(k) + SCB_HEADER + i] = select(scb_unorder(u), -3.0e38, u == 0u);
}

// Distância exata do nó (cópia k) ao triângulo t.
fn scb_distance(k: u32, p: vec3f, t: u32) -> f32 {
    let s = scb_triangle(t);
    let c = scb_closest(p, scb_point(k, s.x).xyz, scb_point(k, s.y).xyz, scb_point(k, s.z).xyz);
    return length(p - c.point);
}

// Nós da caixa do triângulo expandida em um nó, limitada a SCB_MAX_SPAN por eixo (os vizinhos chegam pelo flooding).
struct ScbRange {
    i0: vec3u,
    i1: vec3u,
    valid: bool,
}

fn scb_range(k: u32, t: u32) -> ScbRange {
    let s = scb_triangle(t);
    let a = scb_point(k, s.x);
    let b = scb_point(k, s.y);
    let c = scb_point(k, s.z);
    let lo = scb_lo(k);
    let n = vec3f(scb_dims() - vec3u(1u));
    let scale = n / max(scb_hi(k) - lo, vec3f(1e-12));
    let ga = (a.xyz - lo) * scale;
    let gb = (b.xyz - lo) * scale;
    let gc = (c.xyz - lo) * scale;
    let mn = clamp(floor(min(min(ga, gb), gc)) - vec3f(1.0), vec3f(0.0), n);
    let mx = clamp(ceil(max(max(ga, gb), gc)) + vec3f(1.0), vec3f(0.0), n);
    let i0 = vec3u(mn);
    let i1 = min(vec3u(mx), i0 + vec3u(SCB_MAX_SPAN - 1u));
    return ScbRange(i0, i1, a.w != 0.0 && b.w != 0.0 && c.w != 0.0);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn scb_seed_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let it = scb_item(gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE, bake.tris);
    let t = it.i;
    let k = it.k;
    if (k >= bake.copies) { return; }
    let r = scb_range(k, t);
    if (!r.valid) { return; }
    for (var z = r.i0.z; z <= r.i1.z; z++) {
        for (var y = r.i0.y; y <= r.i1.y; y++) {
            for (var x = r.i0.x; x <= r.i1.x; x++) {
                let idx = vec3u(x, y, z);
                let d = scb_distance(k, scb_node(k, idx), t);
                atomicMin(&bake_cells[k * bake.cells + scb_cell_index(idx)], bitcast<u32>(d));
            }
        }
    }
}

// Entre os triângulos à distância mínima do nó, o de menor índice.
@compute @workgroup_size(WORKGROUP_SIZE)
fn scb_seed_id_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let it = scb_item(gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE, bake.tris);
    let t = it.i;
    let k = it.k;
    if (k >= bake.copies) { return; }
    let r = scb_range(k, t);
    if (!r.valid) { return; }
    for (var z = r.i0.z; z <= r.i1.z; z++) {
        for (var y = r.i0.y; y <= r.i1.y; y++) {
            for (var x = r.i0.x; x <= r.i1.x; x++) {
                let idx = vec3u(x, y, z);
                let cell = scb_cell_index(idx);
                let d = scb_distance(k, scb_node(k, idx), t);
                if (bitcast<u32>(d) == atomicLoad(&bake_cells[k * bake.cells + cell])) {
                    atomicMin(&bake_ids[(k * 2u) * bake.cells + cell], t);
                }
            }
        }
    }
}

// Uma passada de jump flooding: o nó fica com o triângulo mais próximo entre o seu e os dos 26 vizinhos a `pass_step`
// nós (empate: menor índice). Lê a metade `parity` e escreve a outra.
@compute @workgroup_size(WORKGROUP_SIZE)
fn scb_jfa_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let it = scb_item(gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE, bake.cells);
    let i = it.i;
    let k = it.k;
    if (k >= bake.copies) { return; }
    let src = (k * 2u + bake.parity) * bake.cells;
    let dst = (k * 2u + 1u - bake.parity) * bake.cells;
    let idx = scb_cell_coords(i);
    let p = scb_node(k, idx);
    var best = atomicLoad(&bake_ids[src + i]);
    var best_d = 3.0e38;
    if (best != SCB_NONE) { best_d = scb_distance(k, p, best); }
    let step = i32(bake.pass_step);
    let dims = vec3i(scb_dims());
    for (var dz = -1; dz <= 1; dz++) {
        for (var dy = -1; dy <= 1; dy++) {
            for (var dx = -1; dx <= 1; dx++) {
                if (dx == 0 && dy == 0 && dz == 0) { continue; }
                let q = vec3i(idx) + vec3i(dx, dy, dz) * step;
                if (any(q < vec3i(0)) || any(q >= dims)) { continue; }
                let cand = atomicLoad(&bake_ids[src + scb_cell_index(vec3u(q))]);
                if (cand == SCB_NONE || cand == best) { continue; }
                let d = scb_distance(k, p, cand);
                if (d < best_d || (d == best_d && cand < best)) {
                    best = cand;
                    best_d = d;
                }
            }
        }
    }
    atomicStore(&bake_ids[dst + i], best);
}

// Distância com sinal final: exata ao triângulo do nó; dentro (lado oposto à normal interpolada no ponto mais
// próximo) é negativa. Nó sem triângulo (nenhuma amostra válida): longe.
@compute @workgroup_size(WORKGROUP_SIZE)
fn scb_distance_finish_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let it = scb_item(gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE, bake.cells);
    let i = it.i;
    let k = it.k;
    if (k >= bake.copies) { return; }
    let t = atomicLoad(&bake_ids[(k * 2u + bake.parity) * bake.cells + i]);
    let out = scb_base(k) + SCB_HEADER + i;
    let lo = scb_lo(k);
    let far = 2.0 * length(scb_hi(k) - lo) + 1.0;
    if (t == SCB_NONE) {
        bake_field[out] = far;
        return;
    }
    let p = scb_node(k, scb_cell_coords(i));
    let s = scb_triangle(t);
    let a = scb_point(k, s.x).xyz;
    let b = scb_point(k, s.y).xyz;
    let c = scb_point(k, s.z).xyz;
    let cl = scb_closest(p, a, b, c);
    var n = cl.bary.x * scb_normal(k, s.x) + cl.bary.y * scb_normal(k, s.y) + cl.bary.z * scb_normal(k, s.z);
    if (dot(n, n) <= 1e-24) { n = cross(b - a, c - a); }
    let d = length(p - cl.point);
    bake_field[out] = select(d, -d, dot(p - cl.point, n) < 0.0);
}
