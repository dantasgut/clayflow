[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / InteractionSystemOptions

# Interface: InteractionSystemOptions

Defined in: [presentation/input/InteractionSystem.ts:16](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/presentation/input/InteractionSystem.ts#L16)

Configuração do InteractionSystem. `window` permite injeção em tests
(jsdom) ou para múltiplos canvases compartilharem o mesmo Window.

## Properties

### canvas

> `readonly` **canvas**: `HTMLCanvasElement`

Defined in: [presentation/input/InteractionSystem.ts:18](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/presentation/input/InteractionSystem.ts#L18)

Canvas onde pointer/touch events são capturados.

***

### window

> `readonly` **window**: `Window` \| `null`

Defined in: [presentation/input/InteractionSystem.ts:20](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/presentation/input/InteractionSystem.ts#L20)

Window onde keyboard events são capturados. Null = fallback para canvas.
