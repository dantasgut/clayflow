// Índices de arestas de uma malha de triângulos (spec 008, R7): 6 índices por triângulo (a-b, b-c, c-a), para o
// desenho em linhas (`line-list`) de um material com essa topologia. Arestas compartilhadas saem duas vezes (pixels
// idênticos). Os índices de triângulo podem ser `uint16` (dois por palavra) ou `uint32`.
@group(0) @binding(0) var<uniform>             edge_params:      EdgeParams;
@group(0) @binding(1) var<storage, read>       triangle_indices: array<u32>;
@group(0) @binding(2) var<storage, read_write> edge_indices:     array<u32>;

fn triangle_index(k: u32) -> u32 {
    if (edge_params.indices16 == 1u) {
        let word = triangle_indices[k >> 1u];
        return (word >> ((k & 1u) * 16u)) & 0xFFFFu;
    }
    return triangle_indices[k];
}

@compute @workgroup_size(64)
fn edges_from_triangles_main(
    @builtin(global_invocation_id) gid3: vec3u,
    @builtin(num_workgroups) nwg: vec3u,
) {
    let t = gid3.x + gid3.y * nwg.x * 64u;
    if (t >= edge_params.triangleCount) { return; }
    let a = triangle_index(t * 3u);
    let b = triangle_index(t * 3u + 1u);
    let c = triangle_index(t * 3u + 2u);
    let o = t * 6u;
    edge_indices[o] = a;
    edge_indices[o + 1u] = b;
    edge_indices[o + 2u] = b;
    edge_indices[o + 3u] = c;
    edge_indices[o + 4u] = c;
    edge_indices[o + 5u] = a;
}
