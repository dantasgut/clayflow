// Profundidade da cena para a água (spec 017). O tipo da textura (`texture_depth_2d` sem MSAA ou
// `texture_depth_multisampled_2d` com amostras) é escolhido pelo módulo; `textureLoad` lê o nível 0 ou a amostra 0.
@group(3) @binding(0) var water_scene_depth: WATER_SCENE_DEPTH_TYPE;

// Profundidade NDC da cena no pixel.
fn water_scene_ndc(pixel: vec2f) -> f32 {
    return textureLoad(water_scene_depth, vec2i(pixel), 0);
}

// Profundidade linear da cena no pixel (fundo vazio: muito longe).
fn water_scene_linear(pixel: vec2f, p: mat4x4f) -> f32 {
    let ndc = water_scene_ndc(pixel);
    if (ndc >= 1.0) { return 1e9; }
    return water_linear_depth(ndc, p);
}
