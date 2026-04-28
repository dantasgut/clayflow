// portado de legacy/elements/physics/gpu/wgsl/structs/collider_desc.wgsl.ts
struct ColliderDesc {
    world_mat:     mat4x4f,  // world matrix (local → world)
    inv_world_mat: mat4x4f,  // inversa (world → local) — pré-calculada na CPU
    half:          vec4f,    // parâmetros de forma (ver shape_type)
    shape_type:     u32,      // 0=sphere  1=box  2=plane
    body_owner_idx: u32,     // gpuRbIndex do corpo que possui este collider (0xFFFFFFFFu = nenhum)
    bounds:         vec2f,   // (halfWidth, halfDepth) em espaço local do collider; (0,0) = ilimitado
}
