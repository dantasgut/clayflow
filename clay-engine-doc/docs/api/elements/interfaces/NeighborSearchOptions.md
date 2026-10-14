[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / NeighborSearchOptions

# Interface: NeighborSearchOptions

Defined in: [elements/gpu/NeighborSearchPipeline.ts:25](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/gpu/NeighborSearchPipeline.ts#L25)

Configuração do NeighborSearchPipeline. Define o grid uniform usado
para spatial hashing e capacidades dos buffers.

## Properties

### cellSize?

> `readonly` `optional` **cellSize?**: `number`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:29](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/gpu/NeighborSearchPipeline.ts#L29)

Tamanho de uma cell em world units. Default: 0.1.

***

### discriminator

> `readonly` **discriminator**: `string`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:42](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/gpu/NeighborSearchPipeline.ts#L42)

Discriminador único para isolar buffers entre múltiplas instâncias.

***

### gridDim?

> `readonly` `optional` **gridDim?**: readonly \[`number`, `number`, `number`\]

Defined in: [elements/gpu/NeighborSearchPipeline.ts:27](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/gpu/NeighborSearchPipeline.ts#L27)

Dimensões do grid (cells por eixo). Default: [32, 32, 32].

***

### maxNeighbors

> `readonly` **maxNeighbors**: `number`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:35](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/gpu/NeighborSearchPipeline.ts#L35)

Máximo de vizinhos retornados por partícula (truncate).

***

### maxParticles

> `readonly` **maxParticles**: `number`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:33](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/gpu/NeighborSearchPipeline.ts#L33)

Capacidade máxima de partículas (alocação fixa do buffer).

***

### origin?

> `readonly` `optional` **origin?**: readonly \[`number`, `number`, `number`\]

Defined in: [elements/gpu/NeighborSearchPipeline.ts:31](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/gpu/NeighborSearchPipeline.ts#L31)

Origem (canto -X-Y-Z) do grid em world coords.

***

### particleStrideF32

> `readonly` **particleStrideF32**: `number`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:40](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/gpu/NeighborSearchPipeline.ts#L40)

Stride do particle struct em floats (e.g. 16 para SPHParticle = 64 bytes).
O kernel `assign_count` lê o particle.position desde esse offset.
