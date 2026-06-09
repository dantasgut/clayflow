[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / NeighborSearchOptions

# Interface: NeighborSearchOptions

Defined in: [elements/gpu/NeighborSearchPipeline.ts:20](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/gpu/NeighborSearchPipeline.ts#L20)

Configuração do NeighborSearchPipeline. Define o grid uniform usado
para spatial hashing e capacidades dos buffers.

## Properties

### cellSize?

> `readonly` `optional` **cellSize?**: `number`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:24](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/gpu/NeighborSearchPipeline.ts#L24)

Tamanho de uma cell em world units. Default: 0.1.

***

### discriminator

> `readonly` **discriminator**: `string`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:37](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/gpu/NeighborSearchPipeline.ts#L37)

Discriminador único para isolar buffers entre múltiplas instâncias.

***

### gridDim?

> `readonly` `optional` **gridDim?**: readonly \[`number`, `number`, `number`\]

Defined in: [elements/gpu/NeighborSearchPipeline.ts:22](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/gpu/NeighborSearchPipeline.ts#L22)

Dimensões do grid (cells por eixo). Default: [32, 32, 32].

***

### maxNeighbors

> `readonly` **maxNeighbors**: `number`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:30](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/gpu/NeighborSearchPipeline.ts#L30)

Máximo de vizinhos retornados por partícula (truncate).

***

### maxParticles

> `readonly` **maxParticles**: `number`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:28](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/gpu/NeighborSearchPipeline.ts#L28)

Capacidade máxima de partículas (alocação fixa do buffer).

***

### origin?

> `readonly` `optional` **origin?**: readonly \[`number`, `number`, `number`\]

Defined in: [elements/gpu/NeighborSearchPipeline.ts:26](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/gpu/NeighborSearchPipeline.ts#L26)

Origem (canto -X-Y-Z) do grid em world coords.

***

### particleStrideF32

> `readonly` **particleStrideF32**: `number`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:35](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/gpu/NeighborSearchPipeline.ts#L35)

Stride do particle struct em floats (e.g. 16 para SPHParticle = 64 bytes).
O kernel `assign_count` lê o particle.position desde esse offset.
