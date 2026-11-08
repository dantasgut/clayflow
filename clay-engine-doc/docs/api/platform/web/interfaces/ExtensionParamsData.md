[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / ExtensionParamsData

# Interface: ExtensionParamsData

Defined in: [src/scene/contracts/ExtensionFunction.ts:47](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L47)

Dado de uma função de ponto: o registro tipado da forma (spec 031, R8) — um campo por parâmetro, com o valor (número
ou vetor), e a revisão do código.

## Indexable

> \[`param`: `string`\]: `number` \| `number`[]

Valores dos parâmetros, por nome.

## Properties

### revision

> **revision**: `number`

Defined in: [src/scene/contracts/ExtensionFunction.ts:49](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L49)

Revisão do código (sobe a cada `setCode`/`setGraph`).
