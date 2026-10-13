[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / PBFFlowOptions

# Interface: PBFFlowOptions

Defined in: [elements/physics/flows/PBFFlow.ts:54](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/physics/flows/PBFFlow.ts#L54)

Opções do `PBFFlow`.

## Properties

### maxNeighbors?

> `readonly` `optional` **maxNeighbors?**: `number`

Defined in: [elements/physics/flows/PBFFlow.ts:60](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/physics/flows/PBFFlow.ts#L60)

Vizinhos guardados por partícula (padrão 64).

***

### solverIters?

> `readonly` `optional` **solverIters?**: `number`

Defined in: [elements/physics/flows/PBFFlow.ts:58](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/physics/flows/PBFFlow.ts#L58)

Iterações de projeção de densidade por substep (padrão 4).

***

### substeps?

> `readonly` `optional` **substeps?**: `number`

Defined in: [elements/physics/flows/PBFFlow.ts:56](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/physics/flows/PBFFlow.ts#L56)

Substeps por passo de física (padrão 1). O passo vem do `Time` da cena.
