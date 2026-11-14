[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / MPMSoftSchema

# Variable: MPMSoftSchema

> `const` **MPMSoftSchema**: [`StructSchema`](../../platform/web/classes/StructSchema.md)

Defined in: [src/elements/physics/bodies/schemas/MPMSoftSchema.ts:9](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/bodies/schemas/MPMSoftSchema.ts#L9)

Schema da partícula MPM aplicada a soft bodies (8 vec4f = 128B).
Fonte única do struct WGSL `MPMParticle` (gerado deste schema pela montagem dos shaders). Inclui gradiente de deformação F
(3 colunas) e matriz APIC C (3 colunas) usadas em P2G/G2P.
