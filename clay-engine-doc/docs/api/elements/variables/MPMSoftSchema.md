[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / MPMSoftSchema

# Variable: MPMSoftSchema

> `const` **MPMSoftSchema**: `StructSchema`

Defined in: [elements/physics/bodies/schemas/MPMSoftSchema.ts:10](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/physics/bodies/schemas/MPMSoftSchema.ts#L10)

Schema da partícula MPM aplicada a soft bodies (8 vec4f = 128B).
Layout casa byte-a-byte com o struct WGSL `MPMParticle` em
`gpu/wgsl/structs/mpm_particle.wgsl`. Inclui gradiente de deformação F
(3 colunas) e matriz APIC C (3 colunas) usadas em P2G/G2P.
