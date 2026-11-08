[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / ReduceRecordArgs

# Interface: ReduceRecordArgs

Defined in: [src/elements/gpu/compute/Reduce.ts:46](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/Reduce.ts#L46)

Argumentos de `Reduce.record`.

## Properties

### count

> `readonly` **count**: `number` \| [`GpuCount`](GpuCount.md)

Defined in: [src/elements/gpu/compute/Reduce.ts:54](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/Reduce.ts#L54)

Elementos (≤ `capacity`). `0` não grava nada (a saída fica como está). Ou a contagem lida na GPU (`GpuCount`,
com `src` preparado com o mesmo `counts`): todos os passes da capacidade são gravados, a contagem real limitando
cada um no kernel.

***

### out

> `readonly` **out**: [`StorageBufferSpec`](../../platform/web/interfaces/StorageBufferSpec.md)

Defined in: [src/elements/gpu/compute/Reduce.ts:56](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/Reduce.ts#L56)

Buffer de saída, preparado com `src`.

***

### outOffset?

> `readonly` `optional` **outOffset?**: `number`

Defined in: [src/elements/gpu/compute/Reduce.ts:58](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/Reduce.ts#L58)

Índice (em elementos) do resultado em `out`. Padrão 0.

***

### src

> `readonly` **src**: [`StorageBufferSpec`](../../platform/web/interfaces/StorageBufferSpec.md)

Defined in: [src/elements/gpu/compute/Reduce.ts:48](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/Reduce.ts#L48)

Entrada `T[count]`, preparada antes (`prepare`).
