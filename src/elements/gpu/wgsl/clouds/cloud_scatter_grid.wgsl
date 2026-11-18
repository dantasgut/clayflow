// A grade do cache de espalhamento das nuvens (spec 041, T023, R8): no plano, centrada na câmera (`clouds.scatterGrid.xy`,
// encaixada a `CLOUD_SCATTER_SNAP`) e deformada por `x0·sinh(alcance·a)` (sondas finas perto, crescendo com a distância
// como o pixel da câmera); na altitude, uniforme da base ao topo. Espelho de `reference/cloudScatter.ts`.
// Requer: cloud_common, clouds, cameras, xform_rigid.

/** A posição de mundo da sonda `g` numa grade de `size` sondas (y pela sagita: f32 sem o raio do planeta ao quadrado). */
fn cloud_scatter_probe(g: vec3u, size: vec3u) -> vec3f {
    let gr = clouds.scatterGrid;
    let a = (vec2f(f32(g.x), f32(g.z)) + 0.5) / vec2f(f32(size.x), f32(size.z)) * 2.0 - 1.0;
    let xz = gr.xy + gr.z * sinh(gr.w * a);
    let alt = clouds.shell.y + (f32(g.y) + 0.5) / f32(size.y) * clouds.shell.w;
    let y = alt - dot(xz, xz) / (2.0 * (clouds.shell.x + alt));
    return vec3f(xz.x, y, xz.y);
}

/** Coordenadas normalizadas da grade de um ponto (fora de [0, 1] fora dela). */
fn cloud_scatter_uvw(p: vec3f) -> vec3f {
    let gr = clouds.scatterGrid;
    let a = asinh((p.xz - gr.xy) / gr.z) / gr.w;
    let h = cloud_height_fraction(p);
    return vec3f((a.x + 1.0) * 0.5, h, (a.y + 1.0) * 0.5);
}

/** O centro da grade de uma posição da câmera (o mesmo encaixe do empacotamento). */
fn cloud_scatter_center(eye: vec3f) -> vec2f {
    let s = clouds.scatterParams.w;
    return floor(eye.xz / s + 0.5) * s;
}

/**
 * A fatia anterior do cache vale para este quadro: a série vale, sem corte de câmera e com o mesmo centro da grade (a
 * posição da câmera no quadro anterior — a vista anterior é rígida — dava o centro de agora).
 */
fn cloud_scatter_history_valid() -> bool {
    let cam = cameras[clouds.march.w];
    let prev_eye = rigid_inverse(cam.previousView)[3].xyz;
    let moved = any(cloud_scatter_center(prev_eye) != clouds.scatterGrid.xy);
    return clouds.scatterParams.z > 0.5 && cam.history.x < 0.5 && !moved;
}
