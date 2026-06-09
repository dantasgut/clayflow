[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / InteractionPluginOptions

# Interface: InteractionPluginOptions

Defined in: [presentation/plugins/interactionPlugin.ts:7](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/plugins/interactionPlugin.ts#L7)

Opções do interactionPlugin.

## Properties

### window?

> `readonly` `optional` **window?**: `Window` \| `null`

Defined in: [presentation/plugins/interactionPlugin.ts:12](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/plugins/interactionPlugin.ts#L12)

Window onde keyboard listeners são registrados. Default: `window` global.
Use null para desabilitar keyboard input (apenas pointer/touch).
