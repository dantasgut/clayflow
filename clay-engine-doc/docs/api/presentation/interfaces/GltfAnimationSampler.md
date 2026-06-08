[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / GltfAnimationSampler

# Interface: GltfAnimationSampler

Defined in: [presentation/assets/GltfLoader.ts:88](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/GltfLoader.ts#L88)

Sampler de uma animation: pares (input → output) que descrevem keyframes.
Múltiplos channels podem compartilhar o mesmo sampler (e.g. translation
de vários nodes seguindo o mesmo timing).

## Properties

### input

> `readonly` **input**: `Float32Array`

Defined in: [presentation/assets/GltfLoader.ts:90](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/GltfLoader.ts#L90)

Tempos dos keyframes em segundos (monotonicamente crescente).

***

### interpolation

> `readonly` **interpolation**: [`GltfInterpolation`](../type-aliases/GltfInterpolation.md)

Defined in: [presentation/assets/GltfLoader.ts:94](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/GltfLoader.ts#L94)

Modo de interpolação entre keyframes (LINEAR / STEP / CUBICSPLINE).

***

### output

> `readonly` **output**: `Float32Array`

Defined in: [presentation/assets/GltfLoader.ts:92](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/assets/GltfLoader.ts#L92)

Valores nos keyframes (vec3 para translation/scale, vec4 quaternion).
