[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / SPHSchema

# Variable: SPHSchema

> `const` **SPHSchema**: `StructSchema`

Defined in: [elements/physics/bodies/schemas/SPHSchema.ts:8](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/physics/bodies/schemas/SPHSchema.ts#L8)

Schema da partícula SPH (4 vec4f = 64B).
Fonte única do struct WGSL `SPHParticle` (gerado deste schema pela montagem dos shaders) (pos.w=ρ, vel.w=p).
