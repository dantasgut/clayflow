[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / InteractionPluginOptions

# Interface: InteractionPluginOptions

Defined in: [presentation/plugins/interactionPlugin.ts:7](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/plugins/interactionPlugin.ts#L7)

Opções do interactionPlugin.

## Properties

### window?

> `readonly` `optional` **window?**: `Window` \| `null`

Defined in: [presentation/plugins/interactionPlugin.ts:12](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/plugins/interactionPlugin.ts#L12)

Window onde keyboard listeners são registrados. Default: `window` global.
Use null para desabilitar keyboard input (apenas pointer/touch).
