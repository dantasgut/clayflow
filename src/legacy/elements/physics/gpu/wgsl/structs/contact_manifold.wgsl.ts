/**
 * Struct WGSL: ContactManifold — resultado de colisão partícula-collider.
 *
 * Layout: 48 bytes (3 × vec4f).
 *
 *   normal.xyz        — normal de colisão no espaço mundo (aponta para fora do collider)
 *   normal.w          — profundidade de penetração (positivo = penetrando)
 *   contact_point.xyz — ponto de contato no espaço mundo
 *   contact_point.w   — lambda acumulado (impulso total aplicado — warm starting)
 *   body_a            — índice do corpo A (partícula ou RigidBody)
 *   body_b            — índice do collider em ColliderDesc[]
 *   weight            — peso do contato (1/N para manifolds multi-ponto)
 *   _pad              — padding
 *
 * Buffer: storage read_write. Escrito por GpuCollisionStage, lido por
 * GpuVelocityUpdateStage para aplicar restituição e fricção.
 */
export const WGSL_STRUCT_CONTACT_MANIFOLD = /* wgsl */`

struct ContactManifold {
    normal:        vec4f,  // xyz = normal mundo, w = profundidade
    contact_point: vec4f,  // xyz = ponto contato, w = lambda acumulado
    body_a:        u32,
    body_b:        u32,
    weight:        f32,
    _pad:          f32,
}
`;
