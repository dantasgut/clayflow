// portado de legacy/elements/physics/gpu/wgsl/structs/sph_particle.wgsl.ts
struct SPHParticle {
    pos:   vec4f,   // xyz=posição, w=densidade ρ
    vel:   vec4f,   // xyz=velocidade, w=pressão p
    force: vec4f,   // xyz=força acumulada, w=pad
    color: vec4f,   // xyz=XSPH velocity correction, w=pad
}
