// Tipos do ponto `material` (spec 009): a amostra de superfície que a função recebe (posição de mundo, normal, uv da
// geometria, tempo simulado) e os parâmetros de superfície que ela devolve (cor base, rugosidade, metalicidade,
// emissão). O modelo de luz do forward usa a cor base e soma a emissão (Cook-Torrance com rugosidade e metalicidade é
// da spec 011).
// Requer: nada.

struct SurfaceSample {
    world_position: vec3f,
    normal: vec3f,
    uv: vec2f,
    time: f32,
}

struct SurfaceParams {
    base_color: vec4f,
    roughness: f32,
    metallic: f32,
    emissive: vec3f,
}
