// portado de legacy/elements/physics/gpu/wgsl/structs/contact_manifold.wgsl.ts
struct ContactManifold {
    normal:        vec4f,  // xyz = normal mundo, w = profundidade
    contact_point: vec4f,  // xyz = ponto contato, w = lambda acumulado
    body_a:        u32,
    body_b:        u32,
    weight:        f32,
    _pad:          f32,
}
