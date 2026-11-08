[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / FrameRecordingEvent

# Interface: FrameRecordingEvent

Defined in: [src/scene/events/FrameRecordingEvent.ts:10](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/FrameRecordingEvent.ts#L10)

Payload do evento `frameRecording` — emitido pelo `ExecutionSystem` imediatamente
antes de gravar os passes do quadro (`core.record`). O `ResourceSystem` reage
enviando à GPU, uma única vez, os recursos marcados como sujos desde o quadro
anterior.

Ordem por quadro: `frameTick` → `frameRecording` → gravação dos estágios por fase →
`submit` → `frameComplete`.

## Properties

### elapsed

> `readonly` **elapsed**: `number`

Defined in: [src/scene/events/FrameRecordingEvent.ts:12](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/FrameRecordingEvent.ts#L12)

Tempo acumulado da simulação em segundos — o mesmo do `frameTick` de origem.
