[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / MPMSoftSchema

# Variable: MPMSoftSchema

> `const` **MPMSoftSchema**: `StructSchema`

Defined in: [elements/physics/bodies/schemas/MPMSoftSchema.ts:10](https://github.com/dantasgut/clayflow/blob/204f2e93c5ebaf2f2b7e257814d24c704d7cf3e6/src/elements/physics/bodies/schemas/MPMSoftSchema.ts#L10)

Schema da partícula MPM aplicada a soft bodies (8 vec4f = 128B).
Layout casa byte-a-byte com o struct WGSL `MPMParticle` em
`gpu/wgsl/structs/mpm_particle.wgsl`. Inclui gradiente de deformação F
(3 colunas) e matriz APIC C (3 colunas) usadas em P2G/G2P.
