/**
 * Struct WGSL: Particle — estado de uma partícula SoftBody.
 *
 * Layout: 48 bytes (3 × vec4f, alinhamento std430/std140 correto).
 *
 * Mapeamento com SoftParticle CPU:
 *   pos.xyz  ↔ {x, y, z}         — posição atual
 *   pos.w    ↔ invMass            — massa inversa pré-calculada (particleCount/mass),
 *                                   0.0 se partícula fixada (pinned)
 *   pred.xyz ↔ {px, py, pz}      — posição prevista (escrita por Predict, lida por Solve/Collision)
 *   pred.w   ↔ (reservado)
 *   vel.xyz  ↔ {vx, vy, vz}      — velocidade (derivada em VelocityUpdate, usada em Predict)
 *   vel.w    ↔ (reservado)
 *
 * Nota: invMass substitui o campo booleano `w` do SoftParticle CPU. O valor
 * real (float) é pré-calculado na CPU pelo SimBodyBufferAllocator antes do
 * primeiro upload, eliminando a divisão `particleCount/mass` dentro do shader.
 */
export const WGSL_STRUCT_PARTICLE = /* wgsl */`

struct Particle {
    pos:  vec4f,   // xyz = posição atual,    w = invMass
    pred: vec4f,   // xyz = posição prevista, w = (reservado)
    vel:  vec4f,   // xyz = velocidade,       w = (reservado)
}
`;
