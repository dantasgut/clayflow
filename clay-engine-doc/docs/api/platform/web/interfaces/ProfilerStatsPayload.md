[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / ProfilerStatsPayload

# Interface: ProfilerStatsPayload

Defined in: [src/scene/events/EventMap.ts:251](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L251)

Payload do evento `profilerStats` — emitido periodicamente (throttle
250ms) pelo `DebugFlow` quando habilitado. Permite UI overlays exibirem
FPS, frame time e tempo gasto por stage GPU (via timestamp-query).

## Properties

### avgFrameTimeMs

> `readonly` **avgFrameTimeMs**: `number`

Defined in: [src/scene/events/EventMap.ts:257](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L257)

Média móvel do frame time (ms).

***

### fps

> `readonly` **fps**: `number`

Defined in: [src/scene/events/EventMap.ts:253](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L253)

Frames por segundo calculados sobre janela móvel.

***

### frameTimeMs

> `readonly` **frameTimeMs**: `number`

Defined in: [src/scene/events/EventMap.ts:255](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L255)

Tempo do último frame (ms, wall clock).

***

### gpu?

> `readonly` `optional` **gpu?**: `Omit`\<[`GpuFrameTimedPayload`](GpuFrameTimedPayload.md), `"gpuFrame"`\>

Defined in: [src/scene/events/EventMap.ts:264](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L264)

Tempo de GPU da última leitura por fase, por Flow e por passe (ms; spec 034). Vazio sem leitura.

***

### stagesNs

> `readonly` **stagesNs**: `Readonly`\<`Record`\<`string`, `number`\>\>

Defined in: [src/scene/events/EventMap.ts:262](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L262)

Tempos por stage GPU em nanosegundos (timestamp-query). Vazio se
o device não suporta `timestamp-query` feature.
