[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / XPBDFlowOptions

# Interface: XPBDFlowOptions

Defined in: [elements/physics/flows/XPBDFlow.ts:31](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/flows/XPBDFlow.ts#L31)

Opções do `XPBDFlow`.

## Properties

### constraintPoolKey?

> `readonly` `optional` **constraintPoolKey?**: `string`

Defined in: [elements/physics/flows/XPBDFlow.ts:33](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/flows/XPBDFlow.ts#L33)

Pool das restrições de distância (padrão `DistanceConstraint`).

***

### solverIters?

> `readonly` `optional` **solverIters?**: `number`

Defined in: [elements/physics/flows/XPBDFlow.ts:37](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/flows/XPBDFlow.ts#L37)

Iterações do solver de restrições por substep (padrão 1).

***

### substeps?

> `readonly` `optional` **substeps?**: `number`

Defined in: [elements/physics/flows/XPBDFlow.ts:35](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/flows/XPBDFlow.ts#L35)

Substeps por passo de física (padrão 8). O passo vem do `Time` da cena.
