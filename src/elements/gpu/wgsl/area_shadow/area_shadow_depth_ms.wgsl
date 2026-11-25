// A profundidade da cena com amostras (a primeira), para o traçado da sombra das luzes de área.

fn area_shadow_depth_size() -> vec2u {
    return textureDimensions(scene_depth);
}

fn area_shadow_depth(px: vec2i) -> f32 {
    return textureLoad(scene_depth, px, 0);
}
