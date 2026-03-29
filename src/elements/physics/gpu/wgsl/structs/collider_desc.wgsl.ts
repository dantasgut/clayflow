/**
 * Struct WGSL: ColliderDesc — descritor de collider estático para shaders GPU.
 *
 * Layout: 160 bytes.
 *   offset   0: world_mat     (mat4x4f, 64 bytes) — world matrix do collider
 *   offset  64: inv_world_mat (mat4x4f, 64 bytes) — inversa da world matrix
 *   offset 128: half          (vec4f,   16 bytes) — parâmetros de forma (ver shape_type)
 *   offset 144: shape_type     (u32,      4 bytes)
 *   offset 148: body_owner_idx (u32,      4 bytes) — gpuRbIndex do corpo dono (0xFFFFFFFF = nenhum)
 *   offset 152: bounds         (vec2f,    8 bytes) — (halfWidth, halfDepth); (0,0) = ilimitado
 *
 * shape_type e campo `half`:
 *   0 = Sphere  → half.x = radius
 *   1 = Box     → half.xyz = half-extents (hw, hh, hd)
 *   2 = Plane   → half.xyz = normal (normalizado), half.w = offset (dot(n, origin))
 *
 * Buffer: storage read-only, reescrito uma vez por frame pelo ColliderDescriptorUploader
 * antes do primeiro dispatch do substep.
 *
 * Depende de: nenhum outro módulo.
 */
export const WGSL_STRUCT_COLLIDER_DESC = /* wgsl */`

struct ColliderDesc {
    world_mat:     mat4x4f,  // world matrix (local → world)
    inv_world_mat: mat4x4f,  // inversa (world → local) — pré-calculada na CPU
    half:          vec4f,    // parâmetros de forma (ver shape_type)
    shape_type:     u32,      // 0=sphere  1=box  2=plane
    body_owner_idx: u32,     // gpuRbIndex do corpo que possui este collider (0xFFFFFFFFu = nenhum)
    bounds:         vec2f,   // (halfWidth, halfDepth) em espaço local do collider; (0,0) = ilimitado
}
`;
