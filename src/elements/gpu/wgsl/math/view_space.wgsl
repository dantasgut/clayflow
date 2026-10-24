// Espaços da tela (spec 037, R4): as passagens entre NDC (y para cima), uv (y para baixo, em [0, 1]) e pixels, a
// divisão por w, o teste de ortográfica e a profundidade linear. Sem recursos: as passagens que leem a câmera estão em
// `camera_space`. Profundidade de clip em [0, 1] (`camera_perspective`, `camera_orthographic`).

fn ndc_to_uv(ndc: vec2f) -> vec2f {
    return vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
}

fn uv_to_ndc(uv: vec2f) -> vec2f {
    return vec2f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
}

// Pixel (origem em cima à esquerda, centro em +½) de um alvo de `size` pixels → NDC.
fn pixel_to_ndc(px: vec2f, size: vec2f) -> vec2f {
    return vec2f(px.x / size.x * 2.0 - 1.0, 1.0 - px.y / size.y * 2.0);
}

fn clip_divide(clip: vec4f) -> vec3f {
    return clip.xyz / clip.w;
}

// A projeção é ortográfica (w de clip constante 1)?
fn is_orthographic(projection: mat4x4f) -> bool {
    return projection[3][3] == 1.0;
}

// Distância à frente da câmera (−z da vista) do ponto de profundidade NDC `ndc_z`.
fn view_depth(ndc_z: f32, projection: mat4x4f) -> f32 {
    if (is_orthographic(projection)) { return abs((ndc_z - projection[3].z) / projection[2].z); }
    return projection[3].z / (ndc_z + projection[2].z);
}

// Vetor de movimento (spec 034) em uv (anterior − atual) dos dois clips sem o deslocamento da amostra; repetido em rg e
// ba (o da superfície e o do que está atrás dela — iguais fora de um transmissivo).
fn motion_from_clips(previous: vec4f, current: vec4f) -> vec4f {
    let m = (previous.xy / previous.w - current.xy / current.w) * vec2f(0.5, -0.5);
    return vec4f(m, m);
}
