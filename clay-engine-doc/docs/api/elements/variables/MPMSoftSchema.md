[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / MPMSoftSchema

# Variable: MPMSoftSchema

> `const` **MPMSoftSchema**: `StructSchema`

Defined in: [elements/physics/bodies/schemas/MPMSoftSchema.ts:9](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/physics/bodies/schemas/MPMSoftSchema.ts#L9)

Schema da partícula MPM aplicada a soft bodies (8 vec4f = 128B).
Fonte única do struct WGSL `MPMParticle` (gerado deste schema pela montagem dos shaders). Inclui gradiente de deformação F
(3 colunas) e matriz APIC C (3 colunas) usadas em P2G/G2P.
