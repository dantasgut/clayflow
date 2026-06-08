[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / InteractionSystemOptions

# Interface: InteractionSystemOptions

Defined in: [presentation/input/InteractionSystem.ts:13](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/input/InteractionSystem.ts#L13)

Configuração do InteractionSystem. `window` permite injeção em tests
(jsdom) ou para múltiplos canvases compartilharem o mesmo Window.

## Properties

### canvas

> `readonly` **canvas**: `HTMLCanvasElement`

Defined in: [presentation/input/InteractionSystem.ts:15](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/input/InteractionSystem.ts#L15)

Canvas onde pointer/touch events são capturados.

***

### window

> `readonly` **window**: `Window` \| `null`

Defined in: [presentation/input/InteractionSystem.ts:17](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/input/InteractionSystem.ts#L17)

Window onde keyboard events são capturados. Null = fallback para canvas.
