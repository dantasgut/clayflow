[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / CompactionModules

# Interface: CompactionModules

Defined in: [elements/gpu/compute/shaders.ts:81](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/gpu/compute/shaders.ts#L81)

Kernels de compactação montados sobre um predicado do consumidor.

## Properties

### atomic

> `readonly` **atomic**: `WgslModule`

Defined in: [elements/gpu/compute/shaders.ts:83](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/gpu/compute/shaders.ts#L83)

Passe único por `atomic_alloc` (ordem não garantida).

***

### flags

> `readonly` **flags**: `WgslModule`

Defined in: [elements/gpu/compute/shaders.ts:85](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/gpu/compute/shaders.ts#L85)

Modo estável: flags do predicado.

***

### scatter

> `readonly` **scatter**: `WgslModule`

Defined in: [elements/gpu/compute/shaders.ts:87](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/gpu/compute/shaders.ts#L87)

Modo estável: espalhamento pelas posições escaneadas.
