[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / XPBDRigidSchema

# Variable: XPBDRigidSchema

> `const` **XPBDRigidSchema**: `StructSchema`

Defined in: [elements/physics/bodies/schemas/XPBDRigidSchema.ts:10](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/physics/bodies/schemas/XPBDRigidSchema.ts#L10)

Schema do RigidBody integrado pelo XPBDFlow rigid (10 vec4f = 160B).
Layout idêntico ao LCPSchema (mesmo struct WGSL `RigidBody`); schema
separado para que pool keys distintas separem rigids LCP de rigids XPBD
coexistentes na mesma cena.
