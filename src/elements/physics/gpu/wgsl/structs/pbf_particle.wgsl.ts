/**
 * PBFParticle struct — 64 bytes (4 × vec4f).
 */
export const WGSL_STRUCT_PBF_PARTICLE = /* wgsl */`
struct PBFParticle {
    pos:    vec4f,   // xyz=posição, w=lambda (multiplicador de constraint)
    vel:    vec4f,   // xyz=velocidade, w=pad
    posOld: vec4f,   // posição antes do substep
    curl:   vec4f,   // curl(v) para vorticity confinement, w=pad
}
`;
