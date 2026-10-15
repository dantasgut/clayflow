[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / MPMSoftSchema

# Variable: MPMSoftSchema

> `const` **MPMSoftSchema**: `StructSchema`

Defined in: [elements/physics/bodies/schemas/MPMSoftSchema.ts:9](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/bodies/schemas/MPMSoftSchema.ts#L9)

Schema da partícula MPM aplicada a soft bodies (8 vec4f = 128B).
Fonte única do struct WGSL `MPMParticle` (gerado deste schema pela montagem dos shaders). Inclui gradiente de deformação F
(3 colunas) e matriz APIC C (3 colunas) usadas em P2G/G2P.
