[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / CompactionModules

# Interface: CompactionModules

Defined in: [elements/gpu/compute/shaders.ts:77](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/shaders.ts#L77)

Kernels de compactação montados sobre um predicado do consumidor.

## Properties

### atomic

> `readonly` **atomic**: `WgslModule`

Defined in: [elements/gpu/compute/shaders.ts:79](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/shaders.ts#L79)

Passe único por `atomic_alloc` (ordem não garantida).

***

### flags

> `readonly` **flags**: `WgslModule`

Defined in: [elements/gpu/compute/shaders.ts:81](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/shaders.ts#L81)

Modo estável: flags do predicado.

***

### scatter

> `readonly` **scatter**: `WgslModule`

Defined in: [elements/gpu/compute/shaders.ts:83](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/shaders.ts#L83)

Modo estável: espalhamento pelas posições escaneadas.
