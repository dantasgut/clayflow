[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / SPHSchema

# Variable: SPHSchema

> `const` **SPHSchema**: `StructSchema`

Defined in: [elements/physics/bodies/schemas/SPHSchema.ts:8](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/bodies/schemas/SPHSchema.ts#L8)

Schema da partícula SPH (4 vec4f = 64B).
Fonte única do struct WGSL `SPHParticle` (gerado deste schema pela montagem dos shaders) (pos.w=ρ, vel.w=p).
