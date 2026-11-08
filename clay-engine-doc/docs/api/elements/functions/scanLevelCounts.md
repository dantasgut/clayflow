[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / scanLevelCounts

# Function: scanLevelCounts()

> **scanLevelCounts**(`count`): `number`[]

Defined in: [src/elements/gpu/compute/PrefixSum.ts:29](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/PrefixSum.ts#L29)

Contagens de cada nível da soma de prefixos para `count` elementos: `n_0 = count`, `n_{l+1} = ⌈n_l / 256⌉`, até um
nível com ≤ 256 elementos (o topo, escaneado num grupo único). Sempre há ao menos um nível abaixo do topo.

## Parameters

### count

`number`

## Returns

`number`[]
