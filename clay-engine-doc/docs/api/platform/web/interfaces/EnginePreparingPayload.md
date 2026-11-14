[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / EnginePreparingPayload

# Interface: EnginePreparingPayload

Defined in: [src/scene/events/EventMap.ts:220](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L220)

Payload do evento `enginePreparing` (spec 034): o que falta para o quadro sair completo.

## Properties

### pending

> `readonly` **pending**: readonly [`PendingWork`](PendingWork.md)[]

Defined in: [src/scene/events/EventMap.ts:224](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L224)

Trabalho pendente: Flow, pipeline, motivo e, sem fonte, o binding.

***

### revision

> `readonly` **revision**: `number`

Defined in: [src/scene/events/EventMap.ts:222](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L222)

Revisão da prontidão (sobe a cada transição).
