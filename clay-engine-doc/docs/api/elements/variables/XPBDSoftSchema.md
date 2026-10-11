[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / XPBDSoftSchema

# Variable: XPBDSoftSchema

> `const` **XPBDSoftSchema**: `StructSchema`

Defined in: [elements/physics/bodies/schemas/XPBDSoftSchema.ts:9](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/elements/physics/bodies/schemas/XPBDSoftSchema.ts#L9)

Schema do SoftBody integrado pelo XPBDFlow soft (3 vec4f = 48B).
Layout casa byte-a-byte com o struct WGSL `Particle` em
`gpu/wgsl/structs/particle.wgsl` (pos.w=invMass; pred/vel reservados).
