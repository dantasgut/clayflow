// Structs WGSL alinhadas byte-a-byte com os schemas TS da Camada 3:
//   - PlaneCollider (engine/src/elements/physics/colliders/PlaneCollider.ts) — 32 bytes
//   - BoxCollider (engine/src/elements/physics/colliders/BoxCollider.ts) — 32 bytes
//   - SphereCollider (engine/src/elements/physics/colliders/SphereCollider.ts) — 32 bytes
//   - MeshCollider (engine/src/elements/physics/colliders/MeshCollider.ts) — 16 bytes
//
// Substitui a antiga struct ColliderDesc unificada (160B) do modelo legacy.
// Cada pool é coalesced por schema name pelo ResourceSystem; kernels lêem de
// bindings tipados separados — discriminação por shape acontece via dispatch
// de kernel específico, não via campo runtime.
struct PlaneCollider {
    normal: vec4f,   // xyz = world-space normal, w = padding
    offset: f32,     // distância da origem ao longo da normal
    _pad0: f32,
    _pad1: f32,
    _pad2: f32,
}

struct BoxCollider {
    halfExtents: vec4f,  // xyz = semi-eixos locais, w = padding
    center: vec4f,       // xyz = offset local, w = 1
}

struct SphereCollider {
    center: vec4f,  // xyz = offset local, w = 1
    radius: f32,
    _pad0: f32,
    _pad1: f32,
    _pad2: f32,
}

struct MeshCollider {
    triangleCount: u32,
    firstTriangle: u32,  // índice no pool global de triângulos
    _pad0: u32,
    _pad1: u32,
}
