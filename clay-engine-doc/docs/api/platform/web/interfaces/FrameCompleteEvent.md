[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / FrameCompleteEvent

# Interface: FrameCompleteEvent

Defined in: [src/scene/events/FrameCompleteEvent.ts:8](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/FrameCompleteEvent.ts#L8)

Payload do evento `frameComplete` — emitido pelo `ExecutionSystem` ao fim
de cada frame (após record + submit). Útil para profiling, throttling
de updates não-críticos, e sincronizar UI com taxa de frames.

## Properties

### dt

> `readonly` **dt**: `number`

Defined in: [src/scene/events/FrameCompleteEvent.ts:16](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/FrameCompleteEvent.ts#L16)

Tempo de CPU do frame (ms wall clock): envio dos dados alterados (`frameRecording`)
+ gravação dos estágios + submit. Trabalho em callbacks assíncronos (ex.: pose da
física publicada no readback) fica fora.

***

### elapsed

> `readonly` **elapsed**: `number`

Defined in: [src/scene/events/FrameCompleteEvent.ts:18](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/FrameCompleteEvent.ts#L18)

Tempo total acumulado desde início do GameLoop (segundos).

***

### stats

> `readonly` **stats**: [`FrameStats`](FrameStats.md)

Defined in: [src/scene/events/FrameCompleteEvent.ts:20](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/FrameCompleteEvent.ts#L20)

Estatísticas do frame recém-submetido (draws, dispatches, passes, tempo de GPU).

***

### timestamp

> `readonly` **timestamp**: `number`

Defined in: [src/scene/events/FrameCompleteEvent.ts:10](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/FrameCompleteEvent.ts#L10)

Timestamp em ms (performance.now()) ao fim do frame.
