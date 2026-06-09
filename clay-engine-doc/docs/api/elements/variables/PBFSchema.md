[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / PBFSchema

# Variable: PBFSchema

> `const` **PBFSchema**: `StructSchema`

Defined in: [elements/physics/bodies/schemas/PBFSchema.ts:9](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/physics/bodies/schemas/PBFSchema.ts#L9)

Schema da partícula PBF (4 vec4f = 64B).
Layout casa byte-a-byte com o struct WGSL `PBFParticle` em
`gpu/wgsl/structs/pbf_particle.wgsl` (pos.w=lambda, curl=vorticity).
