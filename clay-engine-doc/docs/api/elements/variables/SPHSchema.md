[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / SPHSchema

# Variable: SPHSchema

> `const` **SPHSchema**: `StructSchema`

Defined in: [elements/physics/bodies/schemas/SPHSchema.ts:9](https://github.com/dantasgut/clayflow/blob/204f2e93c5ebaf2f2b7e257814d24c704d7cf3e6/src/elements/physics/bodies/schemas/SPHSchema.ts#L9)

Schema da partícula SPH (4 vec4f = 64B).
Layout casa byte-a-byte com o struct WGSL `SPHParticle` em
`gpu/wgsl/structs/sph_particle.wgsl` (pos.w=ρ, vel.w=p).
