[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / LCPSchema

# Variable: LCPSchema

> `const` **LCPSchema**: `StructSchema`

Defined in: [elements/physics/bodies/schemas/LCPSchema.ts:9](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/physics/bodies/schemas/LCPSchema.ts#L9)

Schema do RigidBody integrado pelo LCPFlow (10 vec4f = 160B).
Layout casa byte-a-byte com o struct WGSL `RigidBody` em
`gpu/wgsl/structs/rigid_body.wgsl` consumido pelo kernel `rb_predict`.
