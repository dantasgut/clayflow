[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / InferredLayout

# Interface: InferredLayout

Defined in: [src/scene/systems/LayoutInferencer.ts:92](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/LayoutInferencer.ts#L92)

Layout de um pipeline: um grupo por índice de 0 até o maior grupo usado.

## Properties

### groups

> `readonly` **groups**: readonly [`InferredGroup`](InferredGroup.md)[]

Defined in: [src/scene/systems/LayoutInferencer.ts:94](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/LayoutInferencer.ts#L94)

Grupos por índice (0 até o maior usado).

***

### stages

> `readonly` **stages**: `ReadonlyMap`\<`string`, [`WgslStage`](../type-aliases/WgslStage.md)\>

Defined in: [src/scene/systems/LayoutInferencer.ts:96](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/LayoutInferencer.ts#L96)

Estágio de cada entrada pedida.
