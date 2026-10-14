[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / XPBDRigidSchema

# Variable: XPBDRigidSchema

> `const` **XPBDRigidSchema**: `StructSchema`

Defined in: [elements/physics/bodies/schemas/XPBDRigidSchema.ts:10](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/physics/bodies/schemas/XPBDRigidSchema.ts#L10)

Schema do RigidBody integrado pelo XPBDFlow rigid (10 vec4f = 160B).
Layout idêntico ao LCPSchema (mesmo struct WGSL `RigidBody`); schema
separado para que pool keys distintas separem rigids LCP de rigids XPBD
coexistentes na mesma cena.
