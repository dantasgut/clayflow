[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / PhysicsPluginOptions

# Interface: PhysicsPluginOptions

Defined in: [presentation/plugins/physicsPlugin.ts:10](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/plugins/physicsPlugin.ts#L10)

Opções do `physicsPlugin()`.

## Properties

### enabled?

> `readonly` `optional` **enabled?**: readonly (`"LCP"` \| `"XPBD"` \| `"FEM"` \| `"MPM"` \| `"SPH"` \| `"PBF"`)[]

Defined in: [presentation/plugins/physicsPlugin.ts:15](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/plugins/physicsPlugin.ts#L15)

Subset de flows a registrar. Default: todos.
Use para evitar overhead de criar flows que a cena não usa.
