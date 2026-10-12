[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / PhysicsPluginOptions

# Interface: PhysicsPluginOptions

Defined in: [presentation/plugins/physicsPlugin.ts:10](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/presentation/plugins/physicsPlugin.ts#L10)

Opções do `physicsPlugin()`.

## Properties

### enabled?

> `readonly` `optional` **enabled?**: readonly (`"LCP"` \| `"XPBD"` \| `"FEM"` \| `"MPM"` \| `"SPH"` \| `"PBF"`)[]

Defined in: [presentation/plugins/physicsPlugin.ts:15](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/presentation/plugins/physicsPlugin.ts#L15)

Subset de flows a registrar. Default: todos.
Use para evitar overhead de criar flows que a cena não usa.
