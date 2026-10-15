[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / PBFFlowOptions

# Interface: PBFFlowOptions

Defined in: [elements/physics/flows/PBFFlow.ts:53](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/flows/PBFFlow.ts#L53)

Opções do `PBFFlow`.

## Properties

### maxNeighbors?

> `readonly` `optional` **maxNeighbors?**: `number`

Defined in: [elements/physics/flows/PBFFlow.ts:62](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/flows/PBFFlow.ts#L62)

Vizinhos guardados por partícula (padrão 64).

***

### solverIters?

> `readonly` `optional` **solverIters?**: `number`

Defined in: [elements/physics/flows/PBFFlow.ts:60](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/flows/PBFFlow.ts#L60)

Iterações de projeção de densidade por substep (padrão 4).

***

### substeps?

> `readonly` `optional` **substeps?**: `number`

Defined in: [elements/physics/flows/PBFFlow.ts:58](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/flows/PBFFlow.ts#L58)

Mínimo de substeps por passo de física (padrão 1); o passo estável do `ParticleMaterial` pode exigir mais (spec
017). O passo vem do `Time` da cena.
