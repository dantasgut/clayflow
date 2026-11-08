[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / PBFFlowOptions

# Interface: PBFFlowOptions

Defined in: [src/elements/physics/flows/PBFFlow.ts:64](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/PBFFlow.ts#L64)

Opções do `PBFFlow`.

## Properties

### maxNeighbors?

> `readonly` `optional` **maxNeighbors?**: `number`

Defined in: [src/elements/physics/flows/PBFFlow.ts:73](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/PBFFlow.ts#L73)

Vizinhos guardados por partícula (padrão 64).

***

### solverIters?

> `readonly` `optional` **solverIters?**: `number`

Defined in: [src/elements/physics/flows/PBFFlow.ts:71](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/PBFFlow.ts#L71)

Iterações de projeção de densidade por substep (padrão 4).

***

### substeps?

> `readonly` `optional` **substeps?**: `number`

Defined in: [src/elements/physics/flows/PBFFlow.ts:69](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/PBFFlow.ts#L69)

Mínimo de substeps por passo de física (padrão 1); o passo estável do `ParticlePhysics` pode exigir mais (spec
017). O passo vem do `Time` da cena.
