[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / PoolCreatedPayload

# Interface: PoolCreatedPayload

Defined in: [src/scene/events/EventMap.ts:41](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L41)

Payload de `poolCreated`: a C2 criou o pool `poolKey` (primeiro recurso com o schema/algoritmo).

## Properties

### poolKey

> `readonly` **poolKey**: `string`

Defined in: [src/scene/events/EventMap.ts:43](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L43)

Chave do pool criado.

***

### schema

> `readonly` **schema**: [`Schema`](Schema.md)

Defined in: [src/scene/events/EventMap.ts:45](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L45)

Schema do elemento do pool.
