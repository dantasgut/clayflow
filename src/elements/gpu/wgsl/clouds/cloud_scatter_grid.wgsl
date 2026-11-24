// A grade do cache de espalhamento das nuvens (spec 041, T023, R8; T074): no plano, centrada na câmera no referencial das
// nuvens (`clouds.scatterGrid.xy` no mundo: a câmera menos o deslocamento do vento, encaixada a `CLOUD_SCATTER_SNAP`, mais
// o deslocamento — as sondas andam com as nuvens, e o vento não muda o que guardam) e deformada por `x0·sinh(alcance·a)`
// (sondas finas perto, crescendo com a distância como o pixel da câmera); na altitude, uniforme da base ao topo. Espelho
// de `reference/cloudScatter.ts`.
// Requer: cloud_common, clouds, cameras, xform_rigid.

/** A posição de mundo da sonda `g` numa grade de `size` sondas centrada em `center` (y pela sagita). */
fn cloud_scatter_probe_at(g: vec3u, size: vec3u, center: vec2f) -> vec3f {
    let gr = clouds.scatterGrid;
    let a = (vec2f(f32(g.x), f32(g.z)) + 0.5) / vec2f(f32(size.x), f32(size.z)) * 2.0 - 1.0;
    let xz = center + gr.z * sinh(gr.w * a);
    let alt = clouds.shell.y + (f32(g.y) + 0.5) / f32(size.y) * clouds.shell.w;
    let y = alt - dot(xz, xz) / (2.0 * (clouds.shell.x + alt));
    return vec3f(xz.x, y, xz.y);
}

/** A posição de mundo da sonda `g` numa grade de `size` sondas (y pela sagita: f32 sem o raio do planeta ao quadrado). */
fn cloud_scatter_probe(g: vec3u, size: vec3u) -> vec3f {
    return cloud_scatter_probe_at(g, size, clouds.scatterGrid.xy);
}

/** Coordenadas normalizadas no plano (x, z) de um ponto na grade centrada em `center` (fora de [0, 1] fora dela). */
fn cloud_scatter_plane_uv(xz: vec2f, center: vec2f) -> vec2f {
    let gr = clouds.scatterGrid;
    return (asinh((xz - center) / gr.z) / gr.w + 1.0) * 0.5;
}

/** Coordenadas normalizadas da grade de um ponto (fora de [0, 1] fora dela). */
fn cloud_scatter_uvw(p: vec3f) -> vec3f {
    let a = cloud_scatter_plane_uv(p.xz, clouds.scatterGrid.xy);
    return vec3f(a.x, cloud_height_fraction(p), a.y);
}

/** O espaçamento (m) das sondas no plano no ponto `xz` da grade de `size` sondas centrada em `center` (o menor eixo). */
fn cloud_scatter_spacing_at(xz: vec2f, center: vec2f, size: vec3u) -> f32 {
    let gr = clouds.scatterGrid;
    let a = asinh((xz - center) / gr.z) / gr.w;
    let d = gr.z * gr.w * cosh(gr.w * a) * 2.0 / vec2f(f32(size.x), f32(size.z));
    return min(d.x, d.y);
}
