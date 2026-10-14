[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / CompactionModules

# Interface: CompactionModules

Defined in: [elements/gpu/compute/shaders.ts:88](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/gpu/compute/shaders.ts#L88)

Kernels de compactação montados sobre um predicado do consumidor.

## Properties

### atomic

> `readonly` **atomic**: `WgslModule`

Defined in: [elements/gpu/compute/shaders.ts:90](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/gpu/compute/shaders.ts#L90)

Passe único por `atomic_alloc` (ordem não garantida).

***

### flags

> `readonly` **flags**: `WgslModule`

Defined in: [elements/gpu/compute/shaders.ts:92](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/gpu/compute/shaders.ts#L92)

Modo estável: flags do predicado.

***

### scatter

> `readonly` **scatter**: `WgslModule`

Defined in: [elements/gpu/compute/shaders.ts:94](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/gpu/compute/shaders.ts#L94)

Modo estável: espalhamento pelas posições escaneadas.
