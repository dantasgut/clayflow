[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / MPMFluidSchema

# Variable: MPMFluidSchema

> `const` **MPMFluidSchema**: `StructSchema`

Defined in: [elements/physics/bodies/schemas/MPMFluidSchema.ts:10](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/physics/bodies/schemas/MPMFluidSchema.ts#L10)

Schema da partícula MPM aplicada a fluidos (8 vec4f = 128B).
Layout idêntico ao MPMSoftSchema (mesmo struct WGSL `MPMParticle`); schema
separado para que fluidos MPM coexistam em pool distinta de softs MPM com
parâmetros constitutivos distintos no mesmo frame.
