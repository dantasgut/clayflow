[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / InteractionPluginOptions

# Interface: InteractionPluginOptions

Defined in: [presentation/plugins/interactionPlugin.ts:7](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/presentation/plugins/interactionPlugin.ts#L7)

Opções do interactionPlugin.

## Properties

### window?

> `readonly` `optional` **window?**: `Window` \| `null`

Defined in: [presentation/plugins/interactionPlugin.ts:12](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/presentation/plugins/interactionPlugin.ts#L12)

Window onde keyboard listeners são registrados. Default: `window` global.
Use null para desabilitar keyboard input (apenas pointer/touch).
