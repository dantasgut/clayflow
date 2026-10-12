[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / RadixSortRecordArgs

# Interface: RadixSortRecordArgs

Defined in: [elements/gpu/compute/RadixSort.ts:32](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/RadixSort.ts#L32)

Argumentos de `RadixSort.record`.

## Properties

### bits?

> `readonly` `optional` **bits?**: `number`

Defined in: [elements/gpu/compute/RadixSort.ts:40](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/RadixSort.ts#L40)

Bits menos significativos considerados: múltiplo de 4 em [4, 32]. Padrão 32.

***

### count

> `readonly` **count**: `number`

Defined in: [elements/gpu/compute/RadixSort.ts:38](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/RadixSort.ts#L38)

Elementos (≤ `capacity`). `0` não grava nada.

***

### keys

> `readonly` **keys**: `StorageBufferSpec`

Defined in: [elements/gpu/compute/RadixSort.ts:34](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/RadixSort.ts#L34)

Chaves `u32[count]`, ordenadas no lugar (crescente).

***

### values?

> `readonly` `optional` **values?**: `StorageBufferSpec`

Defined in: [elements/gpu/compute/RadixSort.ts:36](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/RadixSort.ts#L36)

Valores `u32[count]` permutados junto com as chaves (exige `withValues`).
