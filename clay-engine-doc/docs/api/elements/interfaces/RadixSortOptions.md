[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / RadixSortOptions

# Interface: RadixSortOptions

Defined in: [elements/gpu/compute/RadixSort.ts:17](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/gpu/compute/RadixSort.ts#L17)

Opções de `RadixSort`.

## Properties

### capacity

> `readonly` **capacity**: `number`

Defined in: [elements/gpu/compute/RadixSort.ts:21](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/gpu/compute/RadixSort.ts#L21)

Maior `count` aceito por `record`.

***

### discriminator

> `readonly` **discriminator**: `string`

Defined in: [elements/gpu/compute/RadixSort.ts:19](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/gpu/compute/RadixSort.ts#L19)

Prefixo único dos recursos da instância.

***

### withValues?

> `readonly` `optional` **withValues?**: `boolean`

Defined in: [elements/gpu/compute/RadixSort.ts:23](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/gpu/compute/RadixSort.ts#L23)

Permite ordenar valores junto com as chaves (aloca o buffer temporário dos valores).
