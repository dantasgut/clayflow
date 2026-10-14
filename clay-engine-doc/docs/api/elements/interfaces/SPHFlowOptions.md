[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / SPHFlowOptions

# Interface: SPHFlowOptions

Defined in: [elements/physics/flows/SPHFlow.ts:42](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/physics/flows/SPHFlow.ts#L42)

Opções do `SPHFlow`.

## Properties

### maxNeighbors?

> `readonly` `optional` **maxNeighbors?**: `number`

Defined in: [elements/physics/flows/SPHFlow.ts:46](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/physics/flows/SPHFlow.ts#L46)

Vizinhos guardados por partícula (padrão 128; o suporte 2h tem ~73 vizinhos em repouso).

***

### substeps?

> `readonly` `optional` **substeps?**: `number`

Defined in: [elements/physics/flows/SPHFlow.ts:44](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/physics/flows/SPHFlow.ts#L44)

Mínimo de substeps por passo (padrão 1); o passo estável do `ParticleMaterial` pode exigir mais.
