[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / ReduceRecordArgs

# Interface: ReduceRecordArgs

Defined in: [elements/gpu/compute/Reduce.ts:41](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/Reduce.ts#L41)

Argumentos de `Reduce.record`.

## Properties

### count

> `readonly` **count**: `number`

Defined in: [elements/gpu/compute/Reduce.ts:45](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/Reduce.ts#L45)

Elementos (≤ `capacity`). `0` não grava nada (a saída fica como está).

***

### out

> `readonly` **out**: `StorageBufferSpec`

Defined in: [elements/gpu/compute/Reduce.ts:47](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/Reduce.ts#L47)

Buffer de saída.

***

### outOffset?

> `readonly` `optional` **outOffset?**: `number`

Defined in: [elements/gpu/compute/Reduce.ts:49](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/Reduce.ts#L49)

Índice (em elementos) do resultado em `out`. Padrão 0.

***

### src

> `readonly` **src**: `StorageBufferSpec`

Defined in: [elements/gpu/compute/Reduce.ts:43](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/Reduce.ts#L43)

Entrada `T[count]`.
