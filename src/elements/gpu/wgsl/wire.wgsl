// Arame com espessura (spec 008, `WireframeMaterial`; o desenho do legado na arquitetura atual): as arestas são da
// geometria, em espaço de objeto (descritor `wireEdges`, pares de índices de vértice) — amostradas antes da projeção.
// Cada aresta vira um quad de `lineWidth` pixels na tela (6 vértices; `vertex_index / 6` é a aresta), com a posição
// dos dois vértices lida do vertex buffer da geometria como storage (8 floats por vértice). A instância é a entidade do
// grupo (registro `Renderable`). Borda suavizada por `fwidth` + `smoothstep`, com mistura alfa.
// Vértices e arestas da geometria do pipeline (bindings privados por geometria).

struct WireOut {
    @builtin(position) clip_position: vec4f,
    @location(0) side: f32,
    @location(1) @interpolate(flat) material_slot: u32,
}

fn wire_vertex(index: u32) -> vec3f {
    let o = index * 8u;
    return vec3f(wire_vertices[o], wire_vertices[o + 1u], wire_vertices[o + 2u]);
}

@vertex
fn vs_main(@builtin(vertex_index) index: u32, @builtin(instance_index) instance: u32) -> WireOut {
    var out: WireOut;
    let edge = index / 6u;
    let corner = index % 6u;
    // Quad: v0 A−, v1 A+, v2 B+, v3 A−, v4 B+, v5 B−.
    let use_b = corner == 2u || corner == 4u || corner == 5u;
    let side = select(-1.0, 1.0, corner == 1u || corner == 2u || corner == 4u);
    let r = renderables[instances[instance].renderable];
    let material = materials[r.materialSlot];
    let mvp = cameras[forward_frame.cameraSlot].viewProjection * worlds[r.transformSlot].world;
    let clip_a = mvp * vec4f(wire_vertex(wire_edges[edge * 2u]), 1.0);
    let clip_b = mvp * vec4f(wire_vertex(wire_edges[edge * 2u + 1u]), 1.0);
    let clip = select(clip_a, clip_b, use_b);
    // Direção da aresta em pixels; o quad cresce na perpendicular, na tela.
    let half_screen = forward_frame.viewport * 0.5;
    let edge_px = (clip_b.xy / clip_b.w - clip_a.xy / clip_a.w) * half_screen;
    let edge_len = length(edge_px);
    let dir = select(vec2f(1.0, 0.0), edge_px / edge_len, edge_len > 1e-4);
    let perp_ndc = vec2f(-dir.y, dir.x) / half_screen;
    let half_width = material.lineWidth * 0.5;
    out.clip_position = vec4f(clip.xy + perp_ndc * side * half_width * clip.w, clip.z, clip.w);
    out.side = side;
    out.material_slot = r.materialSlot;
    return out;
}

@fragment
fn fs_main(in: WireOut) -> @location(0) vec4f {
    let material = materials[in.material_slot];
    let d = abs(in.side);
    let fw = fwidth(d);
    let alpha = 1.0 - smoothstep(1.0 - fw, 1.0 + fw, d);
    return vec4f(material.color.rgb, material.color.a * alpha);
}
