[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / LCPSchema

# Variable: LCPSchema

> `const` **LCPSchema**: `StructSchema`

Defined in: [elements/physics/bodies/schemas/LCPSchema.ts:8](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/physics/bodies/schemas/LCPSchema.ts#L8)

Schema do RigidBody integrado pelo LCPFlow (10 vec4f = 160B).
Fonte única do struct WGSL `RigidBody` (gerado deste schema pela montagem dos shaders) — lido pelo kernel rb_predict.
