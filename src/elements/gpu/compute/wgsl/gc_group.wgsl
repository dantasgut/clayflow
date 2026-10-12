// Coloração de arestas (GraphColorer), agrupamento por cor: chaves (cor) e valores (índice da aresta) para a
// ordenação radix, contagem por cor e intervalos `{ offset, count }` a partir da soma de prefixos das contagens.
@group(0) @binding(0) var<uniform>             gc:          GraphColorParams;
@group(1) @binding(0) var<storage, read>       gc_colors:   array<u32>;
@group(1) @binding(1) var<storage, read_write> gc_keys:     array<u32>;
@group(1) @binding(2) var<storage, read_write> gc_values:   array<u32>;
@group(1) @binding(3) var<storage, read_write> gc_counts:   array<atomic<u32>>;
@group(1) @binding(4) var<storage, read>       gc_offsets:  array<u32>;
@group(1) @binding(5) var<storage, read_write> gc_ranges:   array<ColorRange>;
@group(1) @binding(6) var<storage, read_write> gc_status:   GraphColorStatus;

@compute @workgroup_size(256)
fn gc_sort_init_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let e = gid3.x + gid3.y * nwg.x * 256u;
    if (e >= gc.edge_count) { return; }
    gc_keys[e] = gc_colors[e];
    gc_values[e] = e;
}

@compute @workgroup_size(256)
fn gc_count_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let e = gid3.x + gid3.y * nwg.x * 256u;
    if (e >= gc.edge_count) { return; }
    atomicAdd(&gc_counts[gc_colors[e]], 1u);
}

@compute @workgroup_size(256)
fn gc_ranges_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let c = gid3.x + gid3.y * nwg.x * 256u;
    if (c >= atomicLoad(&gc_status.color_count)) { return; }
    gc_ranges[c] = ColorRange(gc_offsets[c], atomicLoad(&gc_counts[c]));
}
