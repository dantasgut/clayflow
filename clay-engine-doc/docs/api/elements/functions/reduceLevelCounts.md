[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / reduceLevelCounts

# Function: reduceLevelCounts()

> **reduceLevelCounts**(`count`): `number`[]

Defined in: [elements/gpu/compute/Reduce.ts:16](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/gpu/compute/Reduce.ts#L16)

Contagens de cada nível da redução para `count` elementos: `n_0 = count`, `n_{l+1} = ⌈n_l / 256⌉`, até 1. Sempre há
ao menos um passe (`count = 1` → `[1, 1]`).

## Parameters

### count

`number`

## Returns

`number`[]
