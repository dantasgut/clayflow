[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / EntitiesInsertedPayload

# Interface: EntitiesInsertedPayload

Defined in: [src/scene/events/EventMap.ts:113](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L113)

Payload do evento `entitiesInserted` — emitido pelo World depois de `resourcesChanged` quando uma entidade raiz
é inserida. A C2 atualiza os slots de entidades dos Flows (`entitiesChanged`).

## Properties

### entityIds

> `readonly` **entityIds**: readonly [`EntityId`](../type-aliases/EntityId.md)[]

Defined in: [src/scene/events/EventMap.ts:115](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L115)

Ids das entidades raiz inseridas.
