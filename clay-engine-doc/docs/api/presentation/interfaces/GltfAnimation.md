[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / GltfAnimation

# Interface: GltfAnimation

Defined in: [presentation/assets/GltfLoader.ts:114](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/presentation/assets/GltfLoader.ts#L114)

Animation completa — coleção de samplers + channels que, quando avaliados
num tempo `t`, transformam nodes da scene.

## Properties

### channels

> `readonly` **channels**: readonly [`GltfAnimationChannel`](GltfAnimationChannel.md)[]

Defined in: [presentation/assets/GltfLoader.ts:120](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/presentation/assets/GltfLoader.ts#L120)

Channels que mapeiam samplers para (node, path) específicos.

***

### name?

> `readonly` `optional` **name?**: `string`

Defined in: [presentation/assets/GltfLoader.ts:116](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/presentation/assets/GltfLoader.ts#L116)

Nome legível (debug).

***

### samplers

> `readonly` **samplers**: readonly [`GltfAnimationSampler`](GltfAnimationSampler.md)[]

Defined in: [presentation/assets/GltfLoader.ts:118](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/presentation/assets/GltfLoader.ts#L118)

Samplers compartilhados entre channels (input/output/interpolation).
