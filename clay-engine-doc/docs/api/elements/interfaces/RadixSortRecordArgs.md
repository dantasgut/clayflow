[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / RadixSortRecordArgs

# Interface: RadixSortRecordArgs

Defined in: [elements/gpu/compute/RadixSort.ts:27](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/gpu/compute/RadixSort.ts#L27)

Argumentos de `RadixSort.record`.

## Properties

### bits?

> `readonly` `optional` **bits?**: `number`

Defined in: [elements/gpu/compute/RadixSort.ts:35](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/gpu/compute/RadixSort.ts#L35)

Bits menos significativos considerados: múltiplo de 4 em [4, 32]. Padrão 32.

***

### count

> `readonly` **count**: `number`

Defined in: [elements/gpu/compute/RadixSort.ts:33](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/gpu/compute/RadixSort.ts#L33)

Elementos (≤ `capacity`). `0` não grava nada.

***

### keys

> `readonly` **keys**: `StorageBufferSpec`

Defined in: [elements/gpu/compute/RadixSort.ts:29](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/gpu/compute/RadixSort.ts#L29)

Chaves `u32[count]`, ordenadas no lugar (crescente); preparadas antes (`prepare`).

***

### values?

> `readonly` `optional` **values?**: `StorageBufferSpec`

Defined in: [elements/gpu/compute/RadixSort.ts:31](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/gpu/compute/RadixSort.ts#L31)

Valores `u32[count]` permutados junto com as chaves (exige `withValues`).
