[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / GpuFrameTimedPayload

# Interface: GpuFrameTimedPayload

Defined in: [src/scene/events/EventMap.ts:204](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L204)

Payload do evento `gpuFrameTimed` (spec 034): o tempo de GPU de um quadro, uma única vez por quadro, agregado pelos
grupos de depuração da gravação (fase → Flow → passe). Chega 1–3 quadros depois da gravação.

## Properties

### flowsMs

> `readonly` **flowsMs**: `Readonly`\<`Record`\<`string`, `number`\>\>

Defined in: [src/scene/events/EventMap.ts:214](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L214)

Por tipo de Flow, em ms.

***

### gpuFrame

> `readonly` **gpuFrame**: `number`

Defined in: [src/scene/events/EventMap.ts:206](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L206)

Índice do quadro medido.

***

### passesMs

> `readonly` **passesMs**: `Readonly`\<`Record`\<`string`, `number`\>\>

Defined in: [src/scene/events/EventMap.ts:216](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L216)

Por caminho completo do passe (`fase/Flow/rótulo`), em ms.

***

### phasesMs

> `readonly` **phasesMs**: `Readonly`\<`Record`\<`string`, `number`\>\>

Defined in: [src/scene/events/EventMap.ts:212](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L212)

Por fase (`transform`, `shadow`, `forward`, `post`, `ui`; `outros` fora dos grupos), em ms.

***

### spanMs

> `readonly` **spanMs**: `number`

Defined in: [src/scene/events/EventMap.ts:210](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L210)

Do primeiro início ao último fim dos passes (ms): o tempo do quadro na GPU.

***

### totalMs

> `readonly` **totalMs**: `number`

Defined in: [src/scene/events/EventMap.ts:208](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L208)

Soma dos passes medidos (ms). Onde a GPU sobrepõe passes seguidos (TBDR), conta a sobreposição mais de uma vez.
