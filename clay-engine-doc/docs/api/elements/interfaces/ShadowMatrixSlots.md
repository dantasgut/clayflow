[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / ShadowMatrixSlots

# Interface: ShadowMatrixSlots

Defined in: [src/elements/scene/flows/ShadowMatrixFlow.ts:36](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/ShadowMatrixFlow.ts#L36)

Slots do estágio da matriz de sombra.

## Extends

- [`SlotMap`](../../platform/web/type-aliases/SlotMap.md)

## Indexable

> \[`key`: `string`\]: [`SlotDeclaration`](../../platform/web/type-aliases/SlotDeclaration.md)

## Properties

### antialiasing

> `readonly` **antialiasing**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`true`\>

Defined in: [src/elements/scene/flows/ShadowMatrixFlow.ts:46](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/ShadowMatrixFlow.ts#L46)

O antisserrilhado da cena (spec 034): com o deslocamento da amostra, as amostras andam e a penumbra gira.

***

### camera

> `readonly` **camera**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`true`\>

Defined in: [src/elements/scene/flows/ShadowMatrixFlow.ts:48](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/ShadowMatrixFlow.ts#L48)

A câmera ativa (os níveis em volta dela; sem câmera, em volta da origem).

***

### cameras

> `readonly` **cameras**: [`PoolSlot`](../../platform/web/interfaces/PoolSlot.md)\<`true`\>

Defined in: [src/elements/scene/flows/ShadowMatrixFlow.ts:50](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/ShadowMatrixFlow.ts#L50)

Pool das matrizes das câmeras (a posição da ativa).

***

### casters

> `readonly` **casters**: [`EntitiesSlot`](../../platform/web/interfaces/EntitiesSlot.md)

Defined in: [src/elements/scene/flows/ShadowMatrixFlow.ts:44](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/ShadowMatrixFlow.ts#L44)

Luzes direcionais com mapa de sombra: registro `ShadowRecord` e a lista das vivas (grupo único).

***

### lights

> `readonly` **lights**: [`PoolSlot`](../../platform/web/interfaces/PoolSlot.md)\<`false`\>

Defined in: [src/elements/scene/flows/ShadowMatrixFlow.ts:38](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/ShadowMatrixFlow.ts#L38)

Pool `Light` (direção da luz).

***

### maps

> `readonly` **maps**: [`PoolSlot`](../../platform/web/interfaces/PoolSlot.md)\<`false`\>

Defined in: [src/elements/scene/flows/ShadowMatrixFlow.ts:42](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/ShadowMatrixFlow.ts#L42)

Pool `ShadowMap` (o tamanho do mapa: o deslocamento da grade em texels).

***

### matrices

> `readonly` **matrices**: `ChannelSlot`\<`false`\>

Defined in: [src/elements/scene/flows/ShadowMatrixFlow.ts:40](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/ShadowMatrixFlow.ts#L40)

Série `ShadowMatrix` (saída; o quadro anterior pelo atraso 1).

***

### work

> `readonly` **work**: [`WorkSlot`](../../platform/web/interfaces/WorkSlot.md)\<`ShadowMatrixWork`\>

Defined in: [src/elements/scene/flows/ShadowMatrixFlow.ts:52](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/ShadowMatrixFlow.ts#L52)

O espaço de trabalho do estágio: os parâmetros (`ShadowMatrixParams`, spec 039).
