[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / PresentationDefaults

# Interface: PresentationDefaults

Defined in: [presentation/flows/defaults.ts:34](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/flows/defaults.ts#L34)

Bag dos Flows default registrados pelo Application. Permite o app
customizar diretamente (e.g. `defaults.post.addEffect(new Bloom(...))`,
`defaults.debug.setEnabled(true)`).

## Properties

### debug

> `readonly` **debug**: [`DebugFlow`](../classes/DebugFlow.md)

Defined in: [presentation/flows/defaults.ts:44](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/flows/defaults.ts#L44)

Debug overlay — emite profilerStats event quando habilitado.

***

### forward

> `readonly` **forward**: [`ForwardFlow`](../classes/ForwardFlow.md)

Defined in: [presentation/flows/defaults.ts:36](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/flows/defaults.ts#L36)

Forward render pass principal (bind-shadows + per-entity pipelines).

***

### post

> `readonly` **post**: [`PostFlow`](../classes/PostFlow.md)

Defined in: [presentation/flows/defaults.ts:40](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/flows/defaults.ts#L40)

Post-processing chain (Bloom/Fxaa/etc. em ping-pong).

***

### shadow

> `readonly` **shadow**: [`ShadowFlow`](../classes/ShadowFlow.md)

Defined in: [presentation/flows/defaults.ts:38](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/flows/defaults.ts#L38)

Shadow map pass (depth-only, light POV).

***

### ui

> `readonly` **ui**: [`UIFlow`](../classes/UIFlow.md)

Defined in: [presentation/flows/defaults.ts:42](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/flows/defaults.ts#L42)

UI pass (quads + glyphs sobre o canvas).
