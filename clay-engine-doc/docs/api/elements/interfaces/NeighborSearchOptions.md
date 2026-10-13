[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / NeighborSearchOptions

# Interface: NeighborSearchOptions

Defined in: [elements/gpu/NeighborSearchPipeline.ts:24](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/gpu/NeighborSearchPipeline.ts#L24)

Configuração do NeighborSearchPipeline. Define o grid uniform usado
para spatial hashing e capacidades dos buffers.

## Properties

### cellSize?

> `readonly` `optional` **cellSize?**: `number`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:28](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/gpu/NeighborSearchPipeline.ts#L28)

Tamanho de uma cell em world units. Default: 0.1.

***

### discriminator

> `readonly` **discriminator**: `string`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:41](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/gpu/NeighborSearchPipeline.ts#L41)

Discriminador único para isolar buffers entre múltiplas instâncias.

***

### gridDim?

> `readonly` `optional` **gridDim?**: readonly \[`number`, `number`, `number`\]

Defined in: [elements/gpu/NeighborSearchPipeline.ts:26](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/gpu/NeighborSearchPipeline.ts#L26)

Dimensões do grid (cells por eixo). Default: [32, 32, 32].

***

### maxNeighbors

> `readonly` **maxNeighbors**: `number`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:34](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/gpu/NeighborSearchPipeline.ts#L34)

Máximo de vizinhos retornados por partícula (truncate).

***

### maxParticles

> `readonly` **maxParticles**: `number`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:32](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/gpu/NeighborSearchPipeline.ts#L32)

Capacidade máxima de partículas (alocação fixa do buffer).

***

### origin?

> `readonly` `optional` **origin?**: readonly \[`number`, `number`, `number`\]

Defined in: [elements/gpu/NeighborSearchPipeline.ts:30](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/gpu/NeighborSearchPipeline.ts#L30)

Origem (canto -X-Y-Z) do grid em world coords.

***

### particleStrideF32

> `readonly` **particleStrideF32**: `number`

Defined in: [elements/gpu/NeighborSearchPipeline.ts:39](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/gpu/NeighborSearchPipeline.ts#L39)

Stride do particle struct em floats (e.g. 16 para SPHParticle = 64 bytes).
O kernel `assign_count` lê o particle.position desde esse offset.
