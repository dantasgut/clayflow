// Leitura da geometria da estrutura de raios (spec 033, R1): vértices, triângulos e esferas nas palavras do pool
// `RayGeometry`, pela palavra em que o elemento começa.
// Requer: ray_common, ray_geometry.

/** Vértice: posição (w = u) e normal (w = v), em espaço de objeto. */
struct RayVertex {
    position: vec4f,
    normal: vec4f,
}

fn ray_vertex_at(word: u32) -> RayVertex {
    return RayVertex(bitcast<vec4f>(ray_geometry[word].word), bitcast<vec4f>(ray_geometry[word + 1u].word));
}

fn ray_vertex_position_at(word: u32) -> vec3f {
    return bitcast<vec3f>(ray_geometry[word].word.xyz);
}

/** Triângulo: os três vértices (índices relativos ao início da região de vértices). */
fn ray_triangle_at(word: u32) -> vec4u {
    return ray_geometry[word].word;
}

/** Esfera: centro e raio. */
fn ray_sphere_at(word: u32) -> vec4f {
    return bitcast<vec4f>(ray_geometry[word].word);
}
