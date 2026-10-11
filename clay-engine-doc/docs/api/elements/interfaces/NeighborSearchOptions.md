[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / NeighborSearchOptions

# Interface: NeighborSearchOptions

Defined in: [elements/gpu/NeighborSearchPipeline.ts:49](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/elements/gpu/NeighborSearchPipeline.ts#L49)

Configuração do NeighborSearchPipeline. Define o grid uniform usado
para spatial hashing e capacidades dos buffers.

## Properties

### cellSize?

> `readonly` `optional` **cellSize?**: `number`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:53](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/elements/gpu/NeighborSearchPipeline.ts#L53)

Tamanho de uma cell em world units. Default: 0.1.

***

### discriminator

> `readonly` **discriminator**: `string`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:66](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/elements/gpu/NeighborSearchPipeline.ts#L66)

Discriminador único para isolar buffers entre múltiplas instâncias.

***

### gridDim?

> `readonly` `optional` **gridDim?**: readonly \[`number`, `number`, `number`\]

Defined in: [elements/gpu/NeighborSearchPipeline.ts:51](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/elements/gpu/NeighborSearchPipeline.ts#L51)

Dimensões do grid (cells por eixo). Default: [32, 32, 32].

***

### maxNeighbors

> `readonly` **maxNeighbors**: `number`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:59](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/elements/gpu/NeighborSearchPipeline.ts#L59)

Máximo de vizinhos retornados por partícula (truncate).

***

### maxParticles

> `readonly` **maxParticles**: `number`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:57](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/elements/gpu/NeighborSearchPipeline.ts#L57)

Capacidade máxima de partículas (alocação fixa do buffer).

***

### origin?

> `readonly` `optional` **origin?**: readonly \[`number`, `number`, `number`\]

Defined in: [elements/gpu/NeighborSearchPipeline.ts:55](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/elements/gpu/NeighborSearchPipeline.ts#L55)

Origem (canto -X-Y-Z) do grid em world coords.

***

### particleStrideF32

> `readonly` **particleStrideF32**: `number`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:64](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/elements/gpu/NeighborSearchPipeline.ts#L64)

Stride do particle struct em floats (e.g. 16 para SPHParticle = 64 bytes).
O kernel `assign_count` lê o particle.position desde esse offset.
