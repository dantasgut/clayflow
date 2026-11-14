[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / BoundEntities

# Interface: BoundEntities

Defined in: [src/scene/flows/slots.ts:305](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L305)

Conjunto de entidades resolvido, em ordem de inserção.

## Properties

### entries

> `readonly` **entries**: readonly [`EntityEntry`](EntityEntry.md)[]

Defined in: [src/scene/flows/slots.ts:307](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L307)

Entradas, em ordem de inserção.

***

### groups

> `readonly` **groups**: readonly [`DrawGroup`](DrawGroup.md)[]

Defined in: [src/scene/flows/slots.ts:313](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L313)

Grupos não vazios, em ordem de criação, quando o slot declara `groups`; senão vazio.

***

### instances

> `readonly` **instances**: [`BoundPool`](BoundPool.md) \| `undefined`

Defined in: [src/scene/flows/slots.ts:315](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L315)

Pool da lista de instâncias, quando o slot declara `groups` (visão viva).

***

### records

> `readonly` **records**: [`BoundPool`](BoundPool.md) \| `undefined`

Defined in: [src/scene/flows/slots.ts:311](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L311)

Pool dos registros, quando o slot declara `record` (visão viva, como `slot.pool`).

## Methods

### entry()

> **entry**(`entityId`): [`EntityEntry`](EntityEntry.md) \| `undefined`

Defined in: [src/scene/flows/slots.ts:309](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L309)

Entrada da entidade, ou `undefined`.

#### Parameters

##### entityId

[`EntityId`](../type-aliases/EntityId.md)

#### Returns

[`EntityEntry`](EntityEntry.md) \| `undefined`
