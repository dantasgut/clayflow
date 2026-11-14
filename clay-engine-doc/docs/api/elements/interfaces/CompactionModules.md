[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / CompactionModules

# Interface: CompactionModules

Defined in: [src/elements/gpu/compute/shaders.ts:331](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/shaders.ts#L331)

Kernels de compactação montados sobre um predicado do consumidor.

## Properties

### atomic

> `readonly` **atomic**: [`WgslModule`](../../platform/web/interfaces/WgslModule.md)

Defined in: [src/elements/gpu/compute/shaders.ts:333](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/shaders.ts#L333)

Passe único por `atomic_alloc` (ordem não garantida).

***

### flags

> `readonly` **flags**: [`WgslModule`](../../platform/web/interfaces/WgslModule.md)

Defined in: [src/elements/gpu/compute/shaders.ts:335](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/shaders.ts#L335)

Modo estável: flags do predicado.

***

### scatter

> `readonly` **scatter**: [`WgslModule`](../../platform/web/interfaces/WgslModule.md)

Defined in: [src/elements/gpu/compute/shaders.ts:337](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/shaders.ts#L337)

Modo estável: espalhamento pelas posições escaneadas.
