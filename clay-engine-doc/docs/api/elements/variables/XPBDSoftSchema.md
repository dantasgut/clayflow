[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / XPBDSoftSchema

# Variable: XPBDSoftSchema

> `const` **XPBDSoftSchema**: `StructSchema`

Defined in: [elements/physics/bodies/schemas/XPBDSoftSchema.ts:9](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/elements/physics/bodies/schemas/XPBDSoftSchema.ts#L9)

Schema do SoftBody integrado pelo XPBDFlow soft (3 vec4f = 48B).
Layout casa byte-a-byte com o struct WGSL `Particle` em
`gpu/wgsl/structs/particle.wgsl` (pos.w=invMass; pred/vel reservados).
