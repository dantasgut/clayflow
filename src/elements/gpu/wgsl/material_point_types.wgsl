// Tipos do ponto `material` (spec 009): a amostra de superfície que a função recebe (posição de mundo, normal, uv da
// geometria, tempo simulado e, nas superfícies com geometria diferencial — spec 010 —, a primeira forma E, F, G, as
// curvaturas K, H, k₁, k₂ e a direção principal de k₁ em mundo; zeros nas outras geometrias; a largura do pixel ou do cone
// e as derivadas do uv, spec 034) e os parâmetros de superfície que ela devolve (cor base, rugosidade, metalicidade,
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
    // Largura no mundo do que o pixel (no desenho) ou o cone do raio (nos acertos) cobre no ponto, e as derivadas do uv
    // na tela (no acerto, isotrópicas pela razão de áreas uv/mundo do triângulo) — para filtrar padrões e texturas
    // na origem (spec 034, H6). Zero onde não há pixel nem cone (kernels sem câmera).
    footprint: f32,
    duvdx: vec2f,
    duvdy: vec2f,
}

struct SurfaceParams {
    base_color: vec4f,
    roughness: f32,
    metallic: f32,
    emissive: vec3f,
}
