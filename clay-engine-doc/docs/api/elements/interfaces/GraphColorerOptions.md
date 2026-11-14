[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / GraphColorerOptions

# Interface: GraphColorerOptions

Defined in: [src/elements/gpu/compute/GraphColorer.ts:54](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/GraphColorer.ts#L54)

Opções de `GraphColorer`.

## Properties

### capacity

> `readonly` **capacity**: `number`

Defined in: [src/elements/gpu/compute/GraphColorer.ts:58](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/GraphColorer.ts#L58)

Maior número de arestas aceito por `color`.

***

### discriminator

> `readonly` **discriminator**: `string`

Defined in: [src/elements/gpu/compute/GraphColorer.ts:56](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/GraphColorer.ts#L56)

Prefixo único dos recursos da instância.

***

### maxColors?

> `readonly` `optional` **maxColors?**: `number`

Defined in: [src/elements/gpu/compute/GraphColorer.ts:60](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/GraphColorer.ts#L60)

Teto de cores; padrão `2Δ` (Δ = grau máximo, calculado na GPU).
