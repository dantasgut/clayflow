[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / FrameTickEvent

# Interface: FrameTickEvent

Defined in: [src/scene/events/FrameTickEvent.ts:5](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/FrameTickEvent.ts#L5)

Payload do evento `frameTick` — emitido a cada quadro por `Application.step()` e pelo `GameLoop`,
sempre depois de `time.advance()`. O `ExecutionSystem` grava o quadro em resposta.

## Properties

### dt

> `readonly` **dt**: `number`

Defined in: [src/scene/events/FrameTickEvent.ts:7](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/FrameTickEvent.ts#L7)

Duração efetiva do quadro em segundos (`realDt × time.scale`).

***

### elapsed

> `readonly` **elapsed**: `number`

Defined in: [src/scene/events/FrameTickEvent.ts:11](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/FrameTickEvent.ts#L11)

Tempo efetivo acumulado (segundos).

***

### frame

> `readonly` **frame**: `number`

Defined in: [src/scene/events/FrameTickEvent.ts:13](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/FrameTickEvent.ts#L13)

Número do quadro (1 no primeiro avanço).

***

### realDt

> `readonly` **realDt**: `number`

Defined in: [src/scene/events/FrameTickEvent.ts:9](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/FrameTickEvent.ts#L9)

Duração real do quadro em segundos, limitada a `time.maxFrameDt`.
