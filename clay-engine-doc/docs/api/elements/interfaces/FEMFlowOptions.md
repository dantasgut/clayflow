[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / FEMFlowOptions

# Interface: FEMFlowOptions

Defined in: [src/elements/physics/flows/FEMFlow.ts:29](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/FEMFlow.ts#L29)

Opções do `FEMFlow`.

## Properties

### damping?

> `readonly` `optional` **damping?**: `number`

Defined in: [src/elements/physics/flows/FEMFlow.ts:37](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/FEMFlow.ts#L37)

Amortecimento da velocidade por passo, em [0, 1]. Padrão 0,05.

***

### lambda?

> `readonly` `optional` **lambda?**: `number`

Defined in: [src/elements/physics/flows/FEMFlow.ts:35](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/FEMFlow.ts#L35)

Segundo parâmetro de Lamé λ (resistência à variação de volume, Pa). Padrão 5e3.

***

### mu?

> `readonly` `optional` **mu?**: `number`

Defined in: [src/elements/physics/flows/FEMFlow.ts:33](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/FEMFlow.ts#L33)

Primeiro parâmetro de Lamé μ (rigidez ao cisalhamento, Pa). Padrão 5e3.

***

### substeps?

> `readonly` `optional` **substeps?**: `number`

Defined in: [src/elements/physics/flows/FEMFlow.ts:31](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/FEMFlow.ts#L31)

Substeps por passo de física (padrão 1). O passo vem do `Time` da cena.
