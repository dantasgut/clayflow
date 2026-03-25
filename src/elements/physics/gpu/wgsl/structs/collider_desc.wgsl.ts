/**
 * Struct WGSL: ColliderDesc — descritor de collider estático para shaders GPU.
 *
 * Layout: 160 bytes.
 *   offset   0: world_mat     (mat4x4f, 64 bytes) — world matrix do collider
 *   offset  64: inv_world_mat (mat4x4f, 64 bytes) — inversa da world matrix
 *   offset 128: half          (vec4f,   16 bytes) — parâmetros de forma (ver shape_type)
 *   offset 144: shape_type    (u32,      4 bytes)
 *   offset 148: _pad          (vec3u,   12 bytes) — alinha struct a 160 bytes
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
    shape_type:    u32,      // 0=sphere  1=box  2=plane
    _pad:          vec3u,    // padding até 160 bytes
}
`;
