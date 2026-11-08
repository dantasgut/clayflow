[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / ConsumerMissingPayload

# Interface: ConsumerMissingPayload

Defined in: [src/scene/events/EventMap.ts:237](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L237)

Payload do evento `consumerMissing` (spec 034, H2): o binding de um pipeline de um Flow ativo continua sem fonte
depois de 120 quadros — falta o resolvedor ou o pool que o fornece; o pipeline espera e o Flow não grava.

## Properties

### flow

> `readonly` **flow**: `string`

Defined in: [src/scene/events/EventMap.ts:239](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L239)

Tipo do Flow.

***

### name

> `readonly` **name**: `string`

Defined in: [src/scene/events/EventMap.ts:243](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L243)

Binding sem fonte.

***

### pipeline

> `readonly` **pipeline**: `string`

Defined in: [src/scene/events/EventMap.ts:241](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L241)

Pipeline do Flow.
