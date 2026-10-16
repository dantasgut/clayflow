// Vista de um produtor da superfície de água (spec 017): câmera (perspectiva ou ortográfica, matrizes do pool
// `CameraMatrices`) ou luz (matriz ortográfica do pool `ShadowMatrix`). Profundidade linear em metros ao longo da vista.

// Escala de cada eixo de uma matriz afim (ortográfica): o comprimento das linhas da parte 3×3.
fn water_affine_scale(m: mat4x4f) -> vec3f {
    return vec3f(
        length(vec3f(m[0].x, m[1].x, m[2].x)),
        length(vec3f(m[0].y, m[1].y, m[2].y)),
        length(vec3f(m[0].z, m[1].z, m[2].z)),
    );
}

// Profundidade linear de vista (distância ao longo de −z da vista) a partir da profundidade NDC e da projeção.
fn water_linear_depth(ndc_z: f32, p: mat4x4f) -> f32 {
    let z = (ndc_z * p[3].w - p[3].z) / (p[2].z - ndc_z * p[2].w);
    return -z;
}

// Profundidade NDC de um ponto de vista (z da vista negativo à frente).
fn water_ndc_depth(view_pos: vec3f, p: mat4x4f) -> f32 {
    let clip = p * vec4f(view_pos, 1.0);
    return clip.z / clip.w;
}

// Pixels por metro na distância `depth` para a projeção `p` de uma câmera (perspectiva ou ortográfica).
fn water_pixels_per_meter(p: mat4x4f, depth: f32, viewport_height: f32) -> f32 {
    let perspective = abs(p[2].w) > 0.5;
    let s = p[1].y * 0.5 * viewport_height;
    return select(s, s / max(depth, 1e-4), perspective);
}
