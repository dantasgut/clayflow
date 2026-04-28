// portado de legacy/elements/physics/gpu/wgsl/structs/particle.wgsl.ts
struct Particle {
    pos:  vec4f,   // xyz = posição atual,    w = invMass
    pred: vec4f,   // xyz = posição prevista, w = (reservado)
    vel:  vec4f,   // xyz = velocidade,       w = (reservado)
}
