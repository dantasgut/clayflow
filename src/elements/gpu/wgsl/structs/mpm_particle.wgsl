// portado de legacy/elements/physics/gpu/wgsl/structs/mpm_particle.wgsl.ts
struct MPMParticle {
    pos:    vec4f,  // xyz = posição world, w = massa
    vel:    vec4f,  // xyz = velocidade,   w = volume de repouso V0_p
    F_col0: vec4f,  // coluna 0 de F (3×3), w = det(F) cacheado
    F_col1: vec4f,  // coluna 1 de F,       w = material_id override
    F_col2: vec4f,  // coluna 2 de F,       w = padding
    C_col0: vec4f,  // coluna 0 de C (APIC affine momentum matrix)
    C_col1: vec4f,  // coluna 1 de C
    C_col2: vec4f,  // coluna 2 de C
}
