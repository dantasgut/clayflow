[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / PrefixSumRecordArgs

# Interface: PrefixSumRecordArgs

Defined in: [elements/gpu/compute/PrefixSum.ts:35](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/gpu/compute/PrefixSum.ts#L35)

Argumentos de `PrefixSum.record`.

## Properties

### count

> `readonly` **count**: `number`

Defined in: [elements/gpu/compute/PrefixSum.ts:41](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/gpu/compute/PrefixSum.ts#L41)

Elementos (≤ `capacity`). `0` não grava nada.

***

### dst

> `readonly` **dst**: `StorageBufferSpec`

Defined in: [elements/gpu/compute/PrefixSum.ts:39](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/gpu/compute/PrefixSum.ts#L39)

Saída `u32[count]`, preparada antes (`prepare`); pode ser o próprio `src` (no lugar).

***

### mode?

> `readonly` `optional` **mode?**: `"exclusive"` \| `"inclusive"`

Defined in: [elements/gpu/compute/PrefixSum.ts:43](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/gpu/compute/PrefixSum.ts#L43)

`exclusive` (padrão): `dst[i] = Σ_{j<i} src[j]`; `inclusive`: `Σ_{j≤i}`.

***

### src

> `readonly` **src**: `StorageBufferSpec`

Defined in: [elements/gpu/compute/PrefixSum.ts:37](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/gpu/compute/PrefixSum.ts#L37)

Entrada `u32[count]`. Não é alterada quando difere de `dst`.
