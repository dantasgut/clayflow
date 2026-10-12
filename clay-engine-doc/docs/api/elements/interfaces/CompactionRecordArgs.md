[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / CompactionRecordArgs

# Interface: CompactionRecordArgs

Defined in: [elements/gpu/compute/Compaction.ts:38](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/Compaction.ts#L38)

Argumentos de `Compaction.record`.

## Properties

### count

> `readonly` **count**: `number`

Defined in: [elements/gpu/compute/Compaction.ts:40](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/Compaction.ts#L40)

Elementos de entrada avaliados pelo predicado (`i ∈ [0, count)`). `0` só zera o contador.

***

### counter

> `readonly` **counter**: `StorageBufferSpec`

Defined in: [elements/gpu/compute/Compaction.ts:44](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/Compaction.ts#L44)

Contador `AtomicAllocCounter`: aceitos (`count`, inclui os recusados) e excedente (`overflow`).

***

### out

> `readonly` **out**: `StorageBufferSpec`

Defined in: [elements/gpu/compute/Compaction.ts:42](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/Compaction.ts#L42)

Saída `u32[capacity]`.
