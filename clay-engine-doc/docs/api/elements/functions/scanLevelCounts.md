[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / scanLevelCounts

# Function: scanLevelCounts()

> **scanLevelCounts**(`count`): `number`[]

Defined in: [elements/gpu/compute/PrefixSum.ts:18](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/gpu/compute/PrefixSum.ts#L18)

Contagens de cada nível da soma de prefixos para `count` elementos: `n_0 = count`, `n_{l+1} = ⌈n_l / 256⌉`, até um
nível com ≤ 256 elementos (o topo, escaneado num grupo único). Sempre há ao menos um nível abaixo do topo.

## Parameters

### count

`number`

## Returns

`number`[]
