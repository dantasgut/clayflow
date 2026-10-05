[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / XPBDSoftSchema

# Variable: XPBDSoftSchema

> `const` **XPBDSoftSchema**: `StructSchema`

Defined in: [elements/physics/bodies/schemas/XPBDSoftSchema.ts:9](https://github.com/dantasgut/clayflow/blob/204f2e93c5ebaf2f2b7e257814d24c704d7cf3e6/src/elements/physics/bodies/schemas/XPBDSoftSchema.ts#L9)

Schema do SoftBody integrado pelo XPBDFlow soft (3 vec4f = 48B).
Layout casa byte-a-byte com o struct WGSL `Particle` em
`gpu/wgsl/structs/particle.wgsl` (pos.w=invMass; pred/vel reservados).
