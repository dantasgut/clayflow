[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / XPBDRigidSchema

# Variable: XPBDRigidSchema

> `const` **XPBDRigidSchema**: `StructSchema`

Defined in: [elements/physics/bodies/schemas/XPBDRigidSchema.ts:10](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/bodies/schemas/XPBDRigidSchema.ts#L10)

Schema do RigidBody integrado pelo XPBDFlow rigid (10 vec4f = 160B).
Layout idêntico ao LCPSchema (mesmo struct WGSL `RigidBody`); schema
separado para que pool keys distintas separem rigids LCP de rigids XPBD
coexistentes na mesma cena.
