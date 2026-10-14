[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / PBFFlowOptions

# Interface: PBFFlowOptions

Defined in: [elements/physics/flows/PBFFlow.ts:55](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/physics/flows/PBFFlow.ts#L55)

Opções do `PBFFlow`.

## Properties

### maxNeighbors?

> `readonly` `optional` **maxNeighbors?**: `number`

Defined in: [elements/physics/flows/PBFFlow.ts:61](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/physics/flows/PBFFlow.ts#L61)

Vizinhos guardados por partícula (padrão 64).

***

### solverIters?

> `readonly` `optional` **solverIters?**: `number`

Defined in: [elements/physics/flows/PBFFlow.ts:59](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/physics/flows/PBFFlow.ts#L59)

Iterações de projeção de densidade por substep (padrão 4).

***

### substeps?

> `readonly` `optional` **substeps?**: `number`

Defined in: [elements/physics/flows/PBFFlow.ts:57](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/physics/flows/PBFFlow.ts#L57)

Substeps por passo de física (padrão 1). O passo vem do `Time` da cena.
