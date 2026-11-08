[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / GltfAnimation

# Interface: GltfAnimation

Defined in: [src/platform/web/assets/GltfLoader.ts:114](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/assets/GltfLoader.ts#L114)

Animation completa — coleção de samplers + channels que, quando avaliados
num tempo `t`, transformam nodes da scene.

## Properties

### channels

> `readonly` **channels**: readonly [`GltfAnimationChannel`](GltfAnimationChannel.md)[]

Defined in: [src/platform/web/assets/GltfLoader.ts:120](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/assets/GltfLoader.ts#L120)

Channels que mapeiam samplers para (node, path) específicos.

***

### name?

> `readonly` `optional` **name?**: `string`

Defined in: [src/platform/web/assets/GltfLoader.ts:116](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/assets/GltfLoader.ts#L116)

Nome legível (debug).

***

### samplers

> `readonly` **samplers**: readonly [`GltfAnimationSampler`](GltfAnimationSampler.md)[]

Defined in: [src/platform/web/assets/GltfLoader.ts:118](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/assets/GltfLoader.ts#L118)

Samplers compartilhados entre channels (input/output/interpolation).
