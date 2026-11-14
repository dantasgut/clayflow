[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / FrameRetiredPayload

# Interface: FrameRetiredPayload

Defined in: [src/scene/events/EventMap.ts:297](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L297)

Payload do evento `frameRetired` — emitido quando um quadro submetido termina na GPU (ou a contagem é zerada
por device perdido/`shutdown`). Quem espera espaço na GPU (`GameLoop`, laços externos) reage a isto em vez de
consultar `framesInFlight` a cada quadro de vídeo.

## Properties

### framesInFlight

> `readonly` **framesInFlight**: `number`

Defined in: [src/scene/events/EventMap.ts:299](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L299)

Quadros ainda em execução na GPU depois desta conclusão.
