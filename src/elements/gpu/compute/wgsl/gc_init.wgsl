// Coloração de arestas (GraphColorer), preparação: arestas sem cor, grau de cada vértice e validação (laços e
// índices fora de `gc.vertex_count` são contados no estado e recusados pela CPU antes das rodadas).
@group(0) @binding(0) var<uniform>             gc:        GraphColorParams;
@group(1) @binding(0) var<storage, read>       gc_edges:  array<vec2u>;
@group(1) @binding(1) var<storage, read_write> gc_colors: array<u32>;
@group(1) @binding(2) var<storage, read_write> gc_degree: array<atomic<u32>>;
@group(1) @binding(3) var<storage, read_write> gc_status: GraphColorStatus;

@compute @workgroup_size(256)
fn gc_init_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let e = gid3.x + gid3.y * nwg.x * 256u;
    if (e >= gc.edge_count) { return; }
    gc_colors[e] = GC_UNCOLORED;
    let edge = gc_edges[e];
    if (edge.x >= gc.vertex_count || edge.y >= gc.vertex_count) {
        atomicAdd(&gc_status.invalid, 1u);
        return;
    }
    if (edge.x == edge.y) {
        atomicAdd(&gc_status.loops, 1u);
        return;
    }
    atomicAdd(&gc_degree[edge.x], 1u);
    atomicAdd(&gc_degree[edge.y], 1u);
}
