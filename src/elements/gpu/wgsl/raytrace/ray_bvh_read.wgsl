// Leitura da hierarquia da estrutura de raios (spec 033, R1): nós, hierarquias de baixo e instâncias nas palavras do
// pool `RayBvh`, pela palavra em que o elemento começa.
// Requer: ray_common, ray_bvh.

/** Instância: as matrizes, os ids e o material copiado do registro da entidade. */
struct RayInstance {
    toObject: mat4x4f,
    toWorld: mat4x4f,
    /** (hierarquia, registro `Renderable`, tipo `RAY_KIND_*`, material). */
    ids: vec4u,
    /** (albedo, rugosidade). */
    material0: vec4f,
    /** (metalicidade em bits, slot da função, 0, 0). */
    material1: vec4u,
}

fn ray_node_at(word: u32) -> RayNode {
    return ray_node_words(ray_bvh[word].word, ray_bvh[word + 1u].word);
}

/** Hierarquia de baixo: (início dos nós, início das primitivas, primitivas, tipo) e (vértices, volume, por folha, 0). */
fn ray_blas_a(word: u32) -> vec4u {
    return ray_bvh[word].word;
}

fn ray_blas_b(word: u32) -> vec4u {
    return ray_bvh[word + 1u].word;
}

fn ray_matrix_at(word: u32) -> mat4x4f {
    return mat4x4f(bitcast<vec4f>(ray_bvh[word].word), bitcast<vec4f>(ray_bvh[word + 1u].word),
        bitcast<vec4f>(ray_bvh[word + 2u].word), bitcast<vec4f>(ray_bvh[word + 3u].word));
}

fn ray_instance_at(word: u32) -> RayInstance {
    return RayInstance(ray_matrix_at(word), ray_matrix_at(word + 4u), ray_bvh[word + 8u].word,
        bitcast<vec4f>(ray_bvh[word + 9u].word), ray_bvh[word + 10u].word);
}

/** Só os ids de uma instância (a travessia não precisa do resto). */
fn ray_instance_ids_at(word: u32) -> vec4u {
    return ray_bvh[word + 8u].word;
}

/** Só a matriz mundo → objeto de uma instância. */
fn ray_instance_to_object_at(word: u32) -> mat4x4f {
    return ray_matrix_at(word);
}
