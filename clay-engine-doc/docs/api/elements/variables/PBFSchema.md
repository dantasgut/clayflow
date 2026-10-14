[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / PBFSchema

# Variable: PBFSchema

> `const` **PBFSchema**: `StructSchema`

Defined in: [elements/physics/bodies/schemas/PBFSchema.ts:8](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/physics/bodies/schemas/PBFSchema.ts#L8)

Schema da partícula PBF (4 vec4f = 64B).
Fonte única do struct WGSL `PBFParticle` (gerado deste schema pela montagem dos shaders) (pos.w=lambda, curl=vorticity).
