[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / CompactionRecordArgs

# Interface: CompactionRecordArgs

Defined in: [elements/gpu/compute/Compaction.ts:34](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/gpu/compute/Compaction.ts#L34)

Argumentos de `Compaction.record`.

## Properties

### count

> `readonly` **count**: `number`

Defined in: [elements/gpu/compute/Compaction.ts:36](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/gpu/compute/Compaction.ts#L36)

Elementos de entrada avaliados pelo predicado (`i ∈ [0, count)`). `0` só zera o contador.

***

### counter

> `readonly` **counter**: `StorageBufferSpec`

Defined in: [elements/gpu/compute/Compaction.ts:40](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/gpu/compute/Compaction.ts#L40)

Contador `AtomicAllocCounter`: aceitos (`count`, inclui os recusados) e excedente (`overflow`).

***

### out

> `readonly` **out**: `StorageBufferSpec`

Defined in: [elements/gpu/compute/Compaction.ts:38](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/gpu/compute/Compaction.ts#L38)

Saída `u32[capacity]`, preparada antes (`prepare`).
