[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / XPBDSoftSchema

# Variable: XPBDSoftSchema

> `const` **XPBDSoftSchema**: `StructSchema`

Defined in: [elements/physics/bodies/schemas/XPBDSoftSchema.ts:8](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/physics/bodies/schemas/XPBDSoftSchema.ts#L8)

Schema do SoftBody integrado pelo XPBDFlow soft (3 vec4f = 48B).
Fonte única do struct WGSL `Particle` (gerado deste schema pela montagem dos shaders) (pos.w=invMass; pred/vel reservados).
