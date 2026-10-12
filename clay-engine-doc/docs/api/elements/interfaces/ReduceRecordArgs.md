[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / ReduceRecordArgs

# Interface: ReduceRecordArgs

Defined in: [elements/gpu/compute/Reduce.ts:37](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/gpu/compute/Reduce.ts#L37)

Argumentos de `Reduce.record`.

## Properties

### count

> `readonly` **count**: `number`

Defined in: [elements/gpu/compute/Reduce.ts:41](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/gpu/compute/Reduce.ts#L41)

Elementos (≤ `capacity`). `0` não grava nada (a saída fica como está).

***

### out

> `readonly` **out**: `StorageBufferSpec`

Defined in: [elements/gpu/compute/Reduce.ts:43](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/gpu/compute/Reduce.ts#L43)

Buffer de saída, preparado com `src`.

***

### outOffset?

> `readonly` `optional` **outOffset?**: `number`

Defined in: [elements/gpu/compute/Reduce.ts:45](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/gpu/compute/Reduce.ts#L45)

Índice (em elementos) do resultado em `out`. Padrão 0.

***

### src

> `readonly` **src**: `StorageBufferSpec`

Defined in: [elements/gpu/compute/Reduce.ts:39](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/gpu/compute/Reduce.ts#L39)

Entrada `T[count]`, preparada antes (`prepare`).
