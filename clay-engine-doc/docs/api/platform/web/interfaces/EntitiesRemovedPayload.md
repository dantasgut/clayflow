[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / EntitiesRemovedPayload

# Interface: EntitiesRemovedPayload

Defined in: [src/scene/events/EventMap.ts:133](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L133)

Payload do evento `entitiesRemoved` — emitido pelo World quando uma ou mais entidades são removidas. A C2 libera os
recursos delas e atualiza os slots de entidades dos Flows (`entitiesChanged`).

## Properties

### entityIds

> `readonly` **entityIds**: readonly [`EntityId`](../type-aliases/EntityId.md)[]

Defined in: [src/scene/events/EventMap.ts:135](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L135)

Ids das entidades raiz removidas.
