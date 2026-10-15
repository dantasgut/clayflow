// Tipos do ponto `material` (spec 009): a amostra de superfície que a função recebe (posição de mundo, normal, uv da
// geometria, tempo simulado e, nas superfícies com geometria diferencial — spec 010 —, a primeira forma E, F, G, as
// curvaturas K, H, k₁, k₂ e a direção principal de k₁ em mundo; zeros nas outras geometrias) e os parâmetros de superfície que ela devolve (cor base, rugosidade, metalicidade,
// emissão). O modelo de luz do forward usa a cor base e soma a emissão (Cook-Torrance com rugosidade e metalicidade é
// da spec 011).
// Requer: nada.

struct SurfaceSample {
    world_position: vec3f,
    normal: vec3f,
    uv: vec2f,
    time: f32,
    metric: vec3f,
    curvature: vec4f,
    principal: vec3f,
}

struct SurfaceParams {
    base_color: vec4f,
    roughness: f32,
    metallic: f32,
    emissive: vec3f,
}
