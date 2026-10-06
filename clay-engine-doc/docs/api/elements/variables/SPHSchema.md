[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / SPHSchema

# Variable: SPHSchema

> `const` **SPHSchema**: `StructSchema`

Defined in: [elements/physics/bodies/schemas/SPHSchema.ts:9](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/elements/physics/bodies/schemas/SPHSchema.ts#L9)

Schema da partícula SPH (4 vec4f = 64B).
Layout casa byte-a-byte com o struct WGSL `SPHParticle` em
`gpu/wgsl/structs/sph_particle.wgsl` (pos.w=ρ, vel.w=p).
