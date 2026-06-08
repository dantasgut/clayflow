[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / XPBDSoftSchema

# Variable: XPBDSoftSchema

> `const` **XPBDSoftSchema**: `StructSchema`

Defined in: [elements/physics/bodies/schemas/XPBDSoftSchema.ts:9](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/physics/bodies/schemas/XPBDSoftSchema.ts#L9)

Schema do SoftBody integrado pelo XPBDFlow soft (3 vec4f = 48B).
Layout casa byte-a-byte com o struct WGSL `Particle` em
`gpu/wgsl/structs/particle.wgsl` (pos.w=invMass; pred/vel reservados).
