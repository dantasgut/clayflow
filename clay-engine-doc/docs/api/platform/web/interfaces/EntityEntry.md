[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / EntityEntry

# Interface: EntityEntry

Defined in: [src/scene/flows/slots.ts:290](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L290)

Entidade de um slot `entities`, com os Resources dos tipos pedidos.

## Properties

### entityId

> `readonly` **entityId**: [`EntityId`](../type-aliases/EntityId.md)

Defined in: [src/scene/flows/slots.ts:292](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L292)

Id da entidade.

***

### recordSlot

> `readonly` **recordSlot**: `number` \| `undefined`

Defined in: [src/scene/flows/slots.ts:301](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L301)

Slot do registro da entidade no pool do `record` do slot (o `firstInstance` do desenho), ou `undefined` sem
`record` ou quando algum campo não tem slot (ex.: descritor fora de pool).

***

### resources

> `readonly` **resources**: readonly [`Resource`](Resource.md)[]

Defined in: [src/scene/flows/slots.ts:294](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L294)

Todos os Resources da entidade.

## Methods

### get()

> **get**\<`T`\>(`type`): `T`

Defined in: [src/scene/flows/slots.ts:296](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L296)

O Resource da entidade que é instância de `type` (um dos tipos de `all`).

#### Type Parameters

##### T

`T` *extends* [`Resource`](Resource.md)

#### Parameters

##### type

[`ResourceType`](../type-aliases/ResourceType.md)\<`T`\>

#### Returns

`T`
