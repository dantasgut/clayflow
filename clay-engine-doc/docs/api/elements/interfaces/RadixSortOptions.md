[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / RadixSortOptions

# Interface: RadixSortOptions

Defined in: [elements/gpu/compute/RadixSort.ts:22](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/RadixSort.ts#L22)

Opções de `RadixSort`.

## Properties

### capacity

> `readonly` **capacity**: `number`

Defined in: [elements/gpu/compute/RadixSort.ts:26](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/RadixSort.ts#L26)

Maior `count` aceito por `record`.

***

### discriminator

> `readonly` **discriminator**: `string`

Defined in: [elements/gpu/compute/RadixSort.ts:24](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/RadixSort.ts#L24)

Prefixo único dos recursos da instância.

***

### withValues?

> `readonly` `optional` **withValues?**: `boolean`

Defined in: [elements/gpu/compute/RadixSort.ts:28](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/RadixSort.ts#L28)

Permite ordenar valores junto com as chaves (aloca o buffer temporário dos valores).
