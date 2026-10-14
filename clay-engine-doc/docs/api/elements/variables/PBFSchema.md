[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / PBFSchema

# Variable: PBFSchema

> `const` **PBFSchema**: `StructSchema`

Defined in: [elements/physics/bodies/schemas/PBFSchema.ts:8](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/physics/bodies/schemas/PBFSchema.ts#L8)

Schema da partícula PBF (4 vec4f = 64B).
Fonte única do struct WGSL `PBFParticle` (gerado deste schema pela montagem dos shaders) (pos.w=lambda, curl=vorticity).
