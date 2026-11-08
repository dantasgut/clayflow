[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / GltfAnimationChannel

# Interface: GltfAnimationChannel

Defined in: [src/platform/web/assets/GltfLoader.ts:101](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/assets/GltfLoader.ts#L101)

Channel de animation — liga um sampler a um (node, path) específico.
Múltiplas channels formam uma `GltfAnimation` completa.

## Properties

### samplerIndex

> `readonly` **samplerIndex**: `number`

Defined in: [src/platform/web/assets/GltfLoader.ts:103](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/assets/GltfLoader.ts#L103)

Índice em `GltfAnimation.samplers`.

***

### targetNode

> `readonly` **targetNode**: `number`

Defined in: [src/platform/web/assets/GltfLoader.ts:105](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/assets/GltfLoader.ts#L105)

Índice em `GltfDocument.nodes` que será animado.

***

### targetPath

> `readonly` **targetPath**: [`GltfAnimationPath`](../type-aliases/GltfAnimationPath.md)

Defined in: [src/platform/web/assets/GltfLoader.ts:107](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/assets/GltfLoader.ts#L107)

Atributo do node alvo (translation/rotation/scale/weights).
