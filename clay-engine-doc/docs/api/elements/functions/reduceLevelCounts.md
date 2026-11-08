[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / reduceLevelCounts

# Function: reduceLevelCounts()

> **reduceLevelCounts**(`count`): `number`[]

Defined in: [src/elements/gpu/compute/Reduce.ts:25](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/Reduce.ts#L25)

Contagens de cada nível da redução para `count` elementos: `n_0 = count`, `n_{l+1} = ⌈n_l / 256⌉`, até 1. Sempre há
ao menos um passe (`count = 1` → `[1, 1]`).

## Parameters

### count

`number`

## Returns

`number`[]
