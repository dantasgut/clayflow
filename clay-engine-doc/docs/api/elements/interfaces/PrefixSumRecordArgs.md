[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / PrefixSumRecordArgs

# Interface: PrefixSumRecordArgs

Defined in: [src/elements/gpu/compute/PrefixSum.ts:48](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/PrefixSum.ts#L48)

Argumentos de `PrefixSum.record`.

## Properties

### count

> `readonly` **count**: `number` \| [`GpuCount`](GpuCount.md)

Defined in: [src/elements/gpu/compute/PrefixSum.ts:57](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/PrefixSum.ts#L57)

Elementos (≤ `capacity`). `0` não grava nada. Ou a contagem lida na GPU (`GpuCount`, com `dst` preparado com o
mesmo `counts`): todos os níveis da capacidade são gravados e a contagem real limita cada um no kernel.

***

### dst

> `readonly` **dst**: [`StorageBufferSpec`](../../platform/web/interfaces/StorageBufferSpec.md)

Defined in: [src/elements/gpu/compute/PrefixSum.ts:52](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/PrefixSum.ts#L52)

Saída `u32[count]`, preparada antes (`prepare`); pode ser o próprio `src` (no lugar).

***

### mode?

> `readonly` `optional` **mode?**: `"exclusive"` \| `"inclusive"`

Defined in: [src/elements/gpu/compute/PrefixSum.ts:59](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/PrefixSum.ts#L59)

`exclusive` (padrão): `dst[i] = Σ_{j<i} src[j]`; `inclusive`: `Σ_{j≤i}`.

***

### pass?

> `readonly` `optional` **pass?**: `ComputePass`

Defined in: [src/elements/gpu/compute/PrefixSum.ts:64](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/PrefixSum.ts#L64)

Passe de compute já aberto: os níveis são gravados nele (despachos em sequência no mesmo passe) em vez de cada um
no seu — menos fronteiras de passe. Exige a soma no lugar (`src === dst`).

***

### src

> `readonly` **src**: [`StorageBufferSpec`](../../platform/web/interfaces/StorageBufferSpec.md)

Defined in: [src/elements/gpu/compute/PrefixSum.ts:50](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/PrefixSum.ts#L50)

Entrada `u32[count]`. Não é alterada quando difere de `dst`.
