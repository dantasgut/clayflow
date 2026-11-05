// Saída do vértice das páginas com as distâncias de recorte (a feature `clip-distances`): o triângulo recortado à
// página no atlas pelo hardware — só os fragmentos da página são gerados.
enable clip_distances;

struct ShadowClippedOut {
    @builtin(position) position: vec4f,
    @builtin(clip_distances) clip: array<f32, 4>,
}

@vertex
fn shadow_depth_vs(in: VsIn, @builtin(instance_index) instance: u32) -> ShadowClippedOut {
    let v = shadow_vertex(in.position, instance);
    let p = v.position.xy;
    let lo = shadow_atlas_clip(shadow_matrices[sp.casterSlot], v.page.xy);
    let hi = shadow_atlas_clip(shadow_matrices[sp.casterSlot], v.page.zw);
    var out: ShadowClippedOut;
    out.position = v.position;
    // Dentro da página: as quatro distâncias ≥ 0 (no clip, y cresce para cima: a linha de cima é `lo.y`).
    out.clip = array<f32, 4>(p.x - lo.x, hi.x - p.x, lo.y - p.y, p.y - hi.y);
    return out;
}
