[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / FlowSuspendedPayload

# Interface: FlowSuspendedPayload

Defined in: [src/scene/events/EventMap.ts:33](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L33)

Payload de `flowSuspended`: o Flow saiu de `ready` (slot obrigatório perdido ou descarte) e deixa o quadro.

## Properties

### flow

> `readonly` **flow**: [`Flow`](../classes/Flow.md)

Defined in: [src/scene/events/EventMap.ts:37](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L37)

O Flow que saiu do quadro.

***

### type

> `readonly` **type**: `string`

Defined in: [src/scene/events/EventMap.ts:35](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L35)

`type` do Flow.
