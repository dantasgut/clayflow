[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / CompactionRecordArgs

# Interface: CompactionRecordArgs

Defined in: [src/elements/gpu/compute/Compaction.ts:39](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/Compaction.ts#L39)

Argumentos de `Compaction.record`.

## Properties

### count

> `readonly` **count**: `number` \| [`GpuCount`](GpuCount.md)

Defined in: [src/elements/gpu/compute/Compaction.ts:44](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/Compaction.ts#L44)

Elementos de entrada avaliados pelo predicado (`i ∈ [0, count)`). `0` só zera o contador. Ou a contagem lida na
GPU (`GpuCount`, com `out` preparado com o mesmo `counts`).

***

### counter

> `readonly` **counter**: [`StorageBufferSpec`](../../platform/web/interfaces/StorageBufferSpec.md)

Defined in: [src/elements/gpu/compute/Compaction.ts:48](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/Compaction.ts#L48)

Contador `AtomicAllocCounter`: aceitos (`count`, inclui os recusados) e excedente (`overflow`).

***

### out

> `readonly` **out**: [`StorageBufferSpec`](../../platform/web/interfaces/StorageBufferSpec.md)

Defined in: [src/elements/gpu/compute/Compaction.ts:46](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/Compaction.ts#L46)

Saída `u32[capacity]`, preparada antes (`prepare`).
