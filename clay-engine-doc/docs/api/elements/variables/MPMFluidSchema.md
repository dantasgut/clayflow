[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / MPMFluidSchema

# Variable: MPMFluidSchema

> `const` **MPMFluidSchema**: `StructSchema`

Defined in: [elements/physics/bodies/schemas/MPMFluidSchema.ts:10](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/physics/bodies/schemas/MPMFluidSchema.ts#L10)

Schema da partícula MPM aplicada a fluidos (8 vec4f = 128B).
Layout idêntico ao MPMSoftSchema (mesmo struct WGSL `MPMParticle`); schema
separado para que fluidos MPM coexistam em pool distinta de softs MPM com
parâmetros constitutivos distintos no mesmo frame.
