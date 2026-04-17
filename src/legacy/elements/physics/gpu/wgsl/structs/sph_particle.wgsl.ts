/**
 * SPHParticle struct — 64 bytes (4 × vec4f).
 */
export const WGSL_STRUCT_SPH_PARTICLE = /* wgsl */`
struct SPHParticle {
    pos:   vec4f,   // xyz=posição, w=densidade ρ
    vel:   vec4f,   // xyz=velocidade, w=pressão p
    force: vec4f,   // xyz=força acumulada, w=pad
    color: vec4f,   // xyz=XSPH velocity correction, w=pad
}
`;
