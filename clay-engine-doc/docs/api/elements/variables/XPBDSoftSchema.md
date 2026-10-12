[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / XPBDSoftSchema

# Variable: XPBDSoftSchema

> `const` **XPBDSoftSchema**: `StructSchema`

Defined in: [elements/physics/bodies/schemas/XPBDSoftSchema.ts:8](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/physics/bodies/schemas/XPBDSoftSchema.ts#L8)

Schema do SoftBody integrado pelo XPBDFlow soft (3 vec4f = 48B).
Fonte única do struct WGSL `Particle` (gerado deste schema pela montagem dos shaders) (pos.w=invMass; pred/vel reservados).
