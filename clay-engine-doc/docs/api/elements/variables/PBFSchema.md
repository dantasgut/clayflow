[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / PBFSchema

# Variable: PBFSchema

> `const` **PBFSchema**: `StructSchema`

Defined in: [elements/physics/bodies/schemas/PBFSchema.ts:8](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/physics/bodies/schemas/PBFSchema.ts#L8)

Schema da partícula PBF (4 vec4f = 64B).
Fonte única do struct WGSL `PBFParticle` (gerado deste schema pela montagem dos shaders) (pos.w=lambda, curl=vorticity).
