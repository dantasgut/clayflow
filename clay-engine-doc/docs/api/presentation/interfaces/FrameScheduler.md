[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [presentation](../README.md) / FrameScheduler

# Interface: FrameScheduler

Defined in: [src/presentation/app/FrameScheduler.ts:5](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/FrameScheduler.ts#L5)

Quem agenda o próximo quadro do laço (spec 038): o `requestAnimationFrame` no navegador (`clayflow/web`), o laço do
Deno (`clayflow/deno`). O núcleo não conhece nenhum dos dois: o `GameLoop` recebe o agendador do ponto de entrada.

## Methods

### cancel()

> **cancel**(`handle`): `void`

Defined in: [src/presentation/app/FrameScheduler.ts:9](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/FrameScheduler.ts#L9)

Cancela um agendamento ainda não executado.

#### Parameters

##### handle

`unknown`

#### Returns

`void`

***

### request()

> **request**(`callback`): `unknown`

Defined in: [src/presentation/app/FrameScheduler.ts:7](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/FrameScheduler.ts#L7)

Agenda `callback` para o próximo quadro; devolve o identificador para `cancel`.

#### Parameters

##### callback

() => `void`

#### Returns

`unknown`
