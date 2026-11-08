[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / TimeDroppedEvent

# Interface: TimeDroppedEvent

Defined in: [src/scene/events/TimeDroppedEvent.ts:5](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/TimeDroppedEvent.ts#L5)

Payload do evento `timeDropped` — emitido pelo `Time` quando o teto de passos por quadro
(`maxStepsPerFrame`) descarta tempo simulado (quadro muito longo, aba em segundo plano).

## Properties

### dropped

> `readonly` **dropped**: `number`

Defined in: [src/scene/events/TimeDroppedEvent.ts:7](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/TimeDroppedEvent.ts#L7)

Tempo de física descartado neste quadro (segundos).
