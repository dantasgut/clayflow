[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / XPBDFlowOptions

# Interface: XPBDFlowOptions

Defined in: [src/elements/physics/flows/XPBDFlow.ts:39](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/XPBDFlow.ts#L39)

Opções do `XPBDFlow`.

## Properties

### constraintPoolKey?

> `readonly` `optional` **constraintPoolKey?**: `string`

Defined in: [src/elements/physics/flows/XPBDFlow.ts:41](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/XPBDFlow.ts#L41)

Pool das restrições de distância (padrão `DistanceConstraint`).

***

### solverIters?

> `readonly` `optional` **solverIters?**: `number`

Defined in: [src/elements/physics/flows/XPBDFlow.ts:45](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/XPBDFlow.ts#L45)

Iterações do solver de restrições por substep (padrão 1).

***

### substeps?

> `readonly` `optional` **substeps?**: `number`

Defined in: [src/elements/physics/flows/XPBDFlow.ts:43](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/XPBDFlow.ts#L43)

Substeps por passo de física (padrão 8). O passo vem do `Time` da cena.
