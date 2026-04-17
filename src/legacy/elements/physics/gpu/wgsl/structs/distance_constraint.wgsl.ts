/**
 * Struct WGSL: DistanceConstraint — constraint de distância entre duas partículas.
 *
 * Layout: 16 bytes (4 × f32/u32, alinhamento std430).
 *
 * Mapeamento direto com SoftConstraint CPU:
 *   i           ↔ índice da partícula A no buffer de partículas
 *   j           ↔ índice da partícula B no buffer de partículas
 *   rest_length ↔ comprimento de repouso da aresta (meters)
 *   compliance  ↔ compliance da constraint (m/N) — 0 = infinitamente rígido
 *
 * Buffer: storage read-only, imutável em runtime.
 * Escrito uma vez pela CPU ao construir o SoftBody.
 */
export const WGSL_STRUCT_DISTANCE_CONSTRAINT = /* wgsl */`

struct DistanceConstraint {
    i:           u32,  // índice partícula A
    j:           u32,  // índice partícula B
    rest_length: f32,  // comprimento de repouso (m)
    compliance:  f32,  // compliance da aresta (m/N)
}
`;
