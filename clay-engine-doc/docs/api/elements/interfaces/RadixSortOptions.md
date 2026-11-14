[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / RadixSortOptions

# Interface: RadixSortOptions

Defined in: [src/elements/gpu/compute/RadixSort.ts:26](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/RadixSort.ts#L26)

Opções de `RadixSort`.

## Properties

### capacity

> `readonly` **capacity**: `number`

Defined in: [src/elements/gpu/compute/RadixSort.ts:30](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/RadixSort.ts#L30)

Maior `count` aceito por `record`.

***

### discriminator

> `readonly` **discriminator**: `string`

Defined in: [src/elements/gpu/compute/RadixSort.ts:28](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/RadixSort.ts#L28)

Prefixo único dos recursos da instância.

***

### withValues?

> `readonly` `optional` **withValues?**: `boolean`

Defined in: [src/elements/gpu/compute/RadixSort.ts:32](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/RadixSort.ts#L32)

Permite ordenar valores junto com as chaves (aloca o buffer temporário dos valores).
