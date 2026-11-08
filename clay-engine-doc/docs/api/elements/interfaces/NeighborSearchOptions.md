[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / NeighborSearchOptions

# Interface: NeighborSearchOptions

Defined in: [src/elements/gpu/NeighborSearchPipeline.ts:32](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/NeighborSearchPipeline.ts#L32)

Configuração do NeighborSearchPipeline. Define o grid uniform usado
para spatial hashing e capacidades dos buffers.

## Properties

### byRank?

> `readonly` `optional` **byRank?**: `boolean`

Defined in: [src/elements/gpu/NeighborSearchPipeline.ts:55](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/NeighborSearchPipeline.ts#L55)

A busca roda e grava na ordem por célula (`neighborOrder`): a lista e a contagem pelo posto `t` da partícula
`neighborOrder[t] − 1`, e quem as lê roda na mesma ordem — threads vizinhos tratam partículas vizinhas e leem os
mesmos vizinhos (o cache da GPU os reaproveita). Padrão: pelo índice da partícula.

***

### cellSize?

> `readonly` `optional` **cellSize?**: `number`

Defined in: [src/elements/gpu/NeighborSearchPipeline.ts:36](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/NeighborSearchPipeline.ts#L36)

Tamanho de uma cell em world units. Default: 0.1.

***

### discriminator

> `readonly` **discriminator**: `string`

Defined in: [src/elements/gpu/NeighborSearchPipeline.ts:49](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/NeighborSearchPipeline.ts#L49)

Prefixo único dos ids dos descritores no Resource de trabalho (várias instâncias no mesmo trabalho).

***

### gridDim?

> `readonly` `optional` **gridDim?**: readonly \[`number`, `number`, `number`\]

Defined in: [src/elements/gpu/NeighborSearchPipeline.ts:34](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/NeighborSearchPipeline.ts#L34)

Dimensões do grid (cells por eixo). Default: [32, 32, 32].

***

### maxNeighbors

> `readonly` **maxNeighbors**: `number`

Defined in: [src/elements/gpu/NeighborSearchPipeline.ts:42](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/NeighborSearchPipeline.ts#L42)

Máximo de vizinhos retornados por partícula (truncate).

***

### maxParticles

> `readonly` **maxParticles**: `number`

Defined in: [src/elements/gpu/NeighborSearchPipeline.ts:40](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/NeighborSearchPipeline.ts#L40)

Capacidade máxima de partículas (alocação fixa do buffer).

***

### origin?

> `readonly` `optional` **origin?**: readonly \[`number`, `number`, `number`\]

Defined in: [src/elements/gpu/NeighborSearchPipeline.ts:38](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/NeighborSearchPipeline.ts#L38)

Origem (canto -X-Y-Z) do grid em world coords.

***

### particleStrideF32

> `readonly` **particleStrideF32**: `number`

Defined in: [src/elements/gpu/NeighborSearchPipeline.ts:47](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/NeighborSearchPipeline.ts#L47)

Stride do particle struct em floats (e.g. 16 para SPHParticle = 64 bytes).
O kernel `assign_count` lê o particle.position desde esse offset.
