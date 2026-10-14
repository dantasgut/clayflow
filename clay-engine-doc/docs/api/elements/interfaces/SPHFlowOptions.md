[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / SPHFlowOptions

# Interface: SPHFlowOptions

Defined in: [elements/physics/flows/SPHFlow.ts:38](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/physics/flows/SPHFlow.ts#L38)

Opções do `SPHFlow`.

## Properties

### maxNeighbors?

> `readonly` `optional` **maxNeighbors?**: `number`

Defined in: [elements/physics/flows/SPHFlow.ts:42](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/physics/flows/SPHFlow.ts#L42)

Vizinhos guardados por partícula (padrão 128; o suporte 2h tem ~73 vizinhos em repouso).

***

### substeps?

> `readonly` `optional` **substeps?**: `number`

Defined in: [elements/physics/flows/SPHFlow.ts:40](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/physics/flows/SPHFlow.ts#L40)

Mínimo de substeps por passo (padrão 1); o passo estável do `ParticleMaterial` pode exigir mais.
