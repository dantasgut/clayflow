/**
 * Struct WGSL: RigidBody — estado de simulação de um corpo rígido na GPU.
 *
 * Layout: 128 bytes (8 × vec4f).
 *
 *   offset   0: pos       (vec4f) — xyz=posição,    w=inv_mass (0=cinemático)
 *   offset  16: vel       (vec4f) — xyz=velocidade linear,   w=0
 *   offset  32: omega     (vec4f) — xyz=velocidade angular,  w=0
 *   offset  48: rot       (vec4f) — quaternion (x,y,z,w)
 *   offset  64: I_inv     (vec4f) — inércia inversa diagonal (frame local), w=0
 *   offset  80: pos_pred  (vec4f) — posição prevista
 *   offset  96: rot_pred  (vec4f) — rotação prevista (quaternion, renormalizar a cada substep)
 *   offset 112: mat_props (vec4f) — x=restitution, y=friction, z=lin_damping, w=ang_damping
 *   Total: 128 bytes
 *
 * Buffer: storage read_write, atualizado pelos kernels rb_predict, rb_solve e rb_velocity_recovery.
 * Um único buffer global contém todos os corpos rígidos — cada corpo tem um índice gpuRbIndex.
 *
 * Depende de: nenhum outro módulo.
 */
export const WGSL_STRUCT_RIGID_BODY = /* wgsl */`

struct RigidBody {
    pos:       vec4f,  // xyz=posição, w=inv_mass (0=cinemático)
    vel:       vec4f,  // xyz=velocidade linear, w=0
    omega:     vec4f,  // xyz=velocidade angular, w=0
    rot:       vec4f,  // quaternion (x,y,z,w)
    I_inv:     vec4f,  // inércia inversa diagonal (frame local), w=0
    pos_pred:  vec4f,  // posição prevista
    rot_pred:  vec4f,  // rotação prevista (quat, renormalizar a cada substep)
    mat_props: vec4f,  // x=restitution, y=friction, z=lin_damping, w=ang_damping
}
`;
