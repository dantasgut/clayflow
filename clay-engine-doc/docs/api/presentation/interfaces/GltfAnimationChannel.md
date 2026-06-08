[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / GltfAnimationChannel

# Interface: GltfAnimationChannel

Defined in: [presentation/assets/GltfLoader.ts:101](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/GltfLoader.ts#L101)

Channel de animation — liga um sampler a um (node, path) específico.
Múltiplas channels formam uma `GltfAnimation` completa.

## Properties

### samplerIndex

> `readonly` **samplerIndex**: `number`

Defined in: [presentation/assets/GltfLoader.ts:103](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/GltfLoader.ts#L103)

Índice em `GltfAnimation.samplers`.

***

### targetNode

> `readonly` **targetNode**: `number`

Defined in: [presentation/assets/GltfLoader.ts:105](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/GltfLoader.ts#L105)

Índice em `GltfDocument.nodes` que será animado.

***

### targetPath

> `readonly` **targetPath**: [`GltfAnimationPath`](../type-aliases/GltfAnimationPath.md)

Defined in: [presentation/assets/GltfLoader.ts:107](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/GltfLoader.ts#L107)

Atributo do node alvo (translation/rotation/scale/weights).
