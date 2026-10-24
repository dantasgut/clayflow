// Profundidade da cena para a água (spec 017). O recurso `water_scene_depth` (`texture_depth_2d` sem MSAA ou
// `texture_depth_multisampled_2d` com amostras) é escolhido pelo módulo da variante; `textureLoad` lê o nível 0 ou a
// amostra 0.

// Profundidade NDC da cena no pixel.
fn water_scene_ndc(pixel: vec2f) -> f32 {
    return textureLoad(water_scene_depth, vec2i(pixel), 0);
}

// Profundidade linear da cena no pixel (fundo vazio: muito longe).
fn water_scene_linear(pixel: vec2f, p: mat4x4f) -> f32 {
    let ndc = water_scene_ndc(pixel);
    if (ndc >= 1.0) { return WATER_NO_DEPTH; }
    return view_depth(ndc, p);
}
