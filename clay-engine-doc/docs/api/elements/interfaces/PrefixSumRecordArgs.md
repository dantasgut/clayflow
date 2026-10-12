[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / PrefixSumRecordArgs

# Interface: PrefixSumRecordArgs

Defined in: [elements/gpu/compute/PrefixSum.ts:40](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/PrefixSum.ts#L40)

Argumentos de `PrefixSum.record`.

## Properties

### count

> `readonly` **count**: `number`

Defined in: [elements/gpu/compute/PrefixSum.ts:46](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/PrefixSum.ts#L46)

Elementos (≤ `capacity`). `0` não grava nada.

***

### dst

> `readonly` **dst**: `StorageBufferSpec`

Defined in: [elements/gpu/compute/PrefixSum.ts:44](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/PrefixSum.ts#L44)

Saída `u32[count]`; pode ser o próprio `src` (no lugar).

***

### mode?

> `readonly` `optional` **mode?**: `"exclusive"` \| `"inclusive"`

Defined in: [elements/gpu/compute/PrefixSum.ts:48](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/PrefixSum.ts#L48)

`exclusive` (padrão): `dst[i] = Σ_{j<i} src[j]`; `inclusive`: `Σ_{j≤i}`.

***

### src

> `readonly` **src**: `StorageBufferSpec`

Defined in: [elements/gpu/compute/PrefixSum.ts:42](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/gpu/compute/PrefixSum.ts#L42)

Entrada `u32[count]`. Não é alterada quando difere de `dst`.
