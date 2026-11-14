[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / RadixSortRecordArgs

# Interface: RadixSortRecordArgs

Defined in: [src/elements/gpu/compute/RadixSort.ts:36](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/RadixSort.ts#L36)

Argumentos de `RadixSort.record`.

## Properties

### bits?

> `readonly` `optional` **bits?**: `number`

Defined in: [src/elements/gpu/compute/RadixSort.ts:47](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/RadixSort.ts#L47)

Bits menos significativos considerados: múltiplo de 4 em [4, 32]. Padrão 32.

***

### count

> `readonly` **count**: `number` \| [`GpuCount`](GpuCount.md)

Defined in: [src/elements/gpu/compute/RadixSort.ts:45](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/RadixSort.ts#L45)

Elementos (≤ `capacity`). `0` não grava nada. Ou a contagem lida na GPU (`GpuCount`, com `keys` preparado com o
mesmo `counts`): o histograma cobre os grupos da capacidade e a contagem real limita os kernels.

***

### keys

> `readonly` **keys**: [`StorageBufferSpec`](../../platform/web/interfaces/StorageBufferSpec.md)

Defined in: [src/elements/gpu/compute/RadixSort.ts:38](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/RadixSort.ts#L38)

Chaves `u32[count]`, ordenadas no lugar (crescente); preparadas antes (`prepare`).

***

### pass?

> `readonly` `optional` **pass?**: `ComputePass`

Defined in: [src/elements/gpu/compute/RadixSort.ts:53](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/RadixSort.ts#L53)

Passe de compute já aberto: as passadas (histograma, soma de prefixos, espalhamento) são gravadas nele em vez de
cada despacho no seu passe — menos fronteiras de passe, o mesmo resultado. Exige contagem da CPU e número par de
passadas (`bits / 4` par: o resultado volta às chaves sem cópia).

***

### values?

> `readonly` `optional` **values?**: [`StorageBufferSpec`](../../platform/web/interfaces/StorageBufferSpec.md)

Defined in: [src/elements/gpu/compute/RadixSort.ts:40](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/RadixSort.ts#L40)

Valores `u32[count]` permutados junto com as chaves (exige `withValues`).
