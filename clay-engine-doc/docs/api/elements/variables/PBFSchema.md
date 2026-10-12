[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / PBFSchema

# Variable: PBFSchema

> `const` **PBFSchema**: `StructSchema`

Defined in: [elements/physics/bodies/schemas/PBFSchema.ts:8](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/physics/bodies/schemas/PBFSchema.ts#L8)

Schema da partícula PBF (4 vec4f = 64B).
Fonte única do struct WGSL `PBFParticle` (gerado deste schema pela montagem dos shaders) (pos.w=lambda, curl=vorticity).
