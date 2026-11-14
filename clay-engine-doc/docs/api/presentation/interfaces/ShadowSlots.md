[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [presentation](../README.md) / ShadowSlots

# Interface: ShadowSlots

Defined in: [src/presentation/flows/ShadowFlow.ts:47](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ShadowFlow.ts#L47)

Slots do estágio de sombra.

## Extends

- [`SlotMap`](../../platform/web/type-aliases/SlotMap.md)

## Indexable

> \[`key`: `string`\]: [`SlotDeclaration`](../../platform/web/type-aliases/SlotDeclaration.md)

## Properties

### atlas

> `readonly` **atlas**: `ChannelSlot`\<`false`\>

Defined in: [src/presentation/flows/ShadowFlow.ts:59](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ShadowFlow.ts#L59)

A série do atlas (a tabela no começo e as páginas físicas: o alvo do desenho; o quadro anterior segue no de agora).

***

### caster

> `readonly` **caster**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`false`\>

Defined in: [src/presentation/flows/ShadowFlow.ts:49](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ShadowFlow.ts#L49)

`ShadowMap` da primeira `DirectionalLight` que projeta sombra.

***

### casters

> `readonly` **casters**: [`EntitiesSlot`](../../platform/web/interfaces/EntitiesSlot.md)

Defined in: [src/presentation/flows/ShadowFlow.ts:55](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ShadowFlow.ts#L55)

Entidades desenhadas no mapa (geometria + transform), em grupos por (geometria, orientação) mantidos pela C2.

***

### matrices

> `readonly` **matrices**: [`PoolSlot`](../../platform/web/interfaces/PoolSlot.md)\<`false`\>

Defined in: [src/presentation/flows/ShadowFlow.ts:53](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ShadowFlow.ts#L53)

Pool `ShadowMatrix` (o referencial do quadro, produzido na GPU pelo `ShadowMatrixFlow`).

***

### rects

> `readonly` **rects**: `ChannelSlot`\<`true`\>

Defined in: [src/presentation/flows/ShadowFlow.ts:61](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ShadowFlow.ts#L61)

A série dos retângulos das instâncias no plano da luz (quem se moveu).

***

### requests

> `readonly` **requests**: `ChannelSlot`\<`false`\>

Defined in: [src/presentation/flows/ShadowFlow.ts:57](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ShadowFlow.ts#L57)

A série dos pedidos de páginas (o quadro anterior, pelo `ShadowRequestFlow`).

***

### work

> `readonly` **work**: [`WorkSlot`](../../platform/web/interfaces/WorkSlot.md)\<`ShadowWork`\>

Defined in: [src/presentation/flows/ShadowFlow.ts:63](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ShadowFlow.ts#L63)

O espaço de trabalho do passe (spec 039).

***

### world

> `readonly` **world**: [`PoolSlot`](../../platform/web/interfaces/PoolSlot.md)\<`false`\>

Defined in: [src/presentation/flows/ShadowFlow.ts:51](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ShadowFlow.ts#L51)

Pool `WorldTransform` (matriz de mundo pelo slot da entidade).
