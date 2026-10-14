[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / MPMFluidSchema

# Variable: MPMFluidSchema

> `const` **MPMFluidSchema**: `StructSchema`

Defined in: [elements/physics/bodies/schemas/MPMFluidSchema.ts:10](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/physics/bodies/schemas/MPMFluidSchema.ts#L10)

Schema da partícula MPM aplicada a fluidos (8 vec4f = 128B).
Layout idêntico ao MPMSoftSchema (mesmo struct WGSL `MPMParticle`); schema
separado para que fluidos MPM coexistam em pool distinta de softs MPM com
parâmetros constitutivos distintos no mesmo frame.
