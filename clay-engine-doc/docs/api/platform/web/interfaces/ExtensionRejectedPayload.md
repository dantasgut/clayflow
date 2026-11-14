[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / ExtensionRejectedPayload

# Interface: ExtensionRejectedPayload

Defined in: [src/scene/events/EventMap.ts:82](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L82)

Payload do evento `extensionRejected` (spec 009) — o compilador rejeitou o código de uma função de ponto de extensão.
O estágio continua com o código anterior (ou com a implementação pronta, se não havia anterior). Anunciado uma vez
por revisão do código de cada função.

## Properties

### line

> `readonly` **line**: `number`

Defined in: [src/scene/events/EventMap.ts:92](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L92)

Linha no código do usuário (0 quando o erro cai fora dele).

***

### message

> `readonly` **message**: `string`

Defined in: [src/scene/events/EventMap.ts:90](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L90)

Mensagem do compilador.

***

### pipeline

> `readonly` **pipeline**: `string`

Defined in: [src/scene/events/EventMap.ts:94](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L94)

Pipeline em que o erro apareceu.

***

### point

> `readonly` **point**: `string`

Defined in: [src/scene/events/EventMap.ts:84](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L84)

Nome do ponto (`transform`, `field`, …).

***

### resource

> `readonly` **resource**: [`PointImplementation`](PointImplementation.md)

Defined in: [src/scene/events/EventMap.ts:86](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L86)

A função rejeitada (a `ExtensionFunction`).

***

### revision

> `readonly` **revision**: `number`

Defined in: [src/scene/events/EventMap.ts:88](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L88)

Revisão do código rejeitado.
