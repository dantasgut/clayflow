[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / XPBDSoftSchema

# Variable: XPBDSoftSchema

> `const` **XPBDSoftSchema**: `StructSchema`

Defined in: [elements/physics/bodies/schemas/XPBDSoftSchema.ts:8](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/physics/bodies/schemas/XPBDSoftSchema.ts#L8)

Schema do SoftBody integrado pelo XPBDFlow soft (3 vec4f = 48B).
Fonte única do struct WGSL `Particle` (gerado deste schema pela montagem dos shaders) (pos.w=invMass; pred/vel reservados).
