[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / MPMFluidSchema

# Variable: MPMFluidSchema

> `const` **MPMFluidSchema**: `StructSchema`

Defined in: [elements/physics/bodies/schemas/MPMFluidSchema.ts:10](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/elements/physics/bodies/schemas/MPMFluidSchema.ts#L10)

Schema da partícula MPM aplicada a fluidos (8 vec4f = 128B).
Layout idêntico ao MPMSoftSchema (mesmo struct WGSL `MPMParticle`); schema
separado para que fluidos MPM coexistam em pool distinta de softs MPM com
parâmetros constitutivos distintos no mesmo frame.
