[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / SPHSchema

# Variable: SPHSchema

> `const` **SPHSchema**: `StructSchema`

Defined in: [elements/physics/bodies/schemas/SPHSchema.ts:9](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/physics/bodies/schemas/SPHSchema.ts#L9)

Schema da partícula SPH (4 vec4f = 64B).
Layout casa byte-a-byte com o struct WGSL `SPHParticle` em
`gpu/wgsl/structs/sph_particle.wgsl` (pos.w=ρ, vel.w=p).
