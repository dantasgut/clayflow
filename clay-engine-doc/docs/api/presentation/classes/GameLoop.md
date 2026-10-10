[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / GameLoop

# Class: GameLoop

Defined in: [presentation/app/GameLoop.ts:14](https://github.com/dantasgut/clayflow/blob/1e865e5867462e68c307a6f63f28da7ac030edf9/src/presentation/app/GameLoop.ts#L14)

Laço de quadros sobre `requestAnimationFrame`. Cada quadro mede o tempo real decorrido e chama `advance`, a
única definição de "avançar um quadro" — a mesma que `Application.step()` usa sem laço: `time.advance(realDt)`
e, em seguida, `frameTick { dt, realDt, elapsed, frame }`. Não há teto de `dt` aqui: o `Time` limita o quadro a
`maxFrameDt` e a física a `maxStepsPerFrame`.

## Constructors

### Constructor

> **new GameLoop**(`events`, `time`): `GameLoop`

Defined in: [presentation/app/GameLoop.ts:18](https://github.com/dantasgut/clayflow/blob/1e865e5867462e68c307a6f63f28da7ac030edf9/src/presentation/app/GameLoop.ts#L18)

#### Parameters

##### events

`EventBus`

##### time

[`Time`](Time.md)

#### Returns

`GameLoop`

## Methods

### advance()

> **advance**(`realDt`): `void`

Defined in: [presentation/app/GameLoop.ts:24](https://github.com/dantasgut/clayflow/blob/1e865e5867462e68c307a6f63f28da7ac030edf9/src/presentation/app/GameLoop.ts#L24)

Avança um quadro de duração real `realDt` (s): move o relógio e emite `frameTick` (síncrono).

#### Parameters

##### realDt

`number`

#### Returns

`void`

***

### isRunning()

> **isRunning**(): `boolean`

Defined in: [presentation/app/GameLoop.ts:58](https://github.com/dantasgut/clayflow/blob/1e865e5867462e68c307a6f63f28da7ac030edf9/src/presentation/app/GameLoop.ts#L58)

True se o laço está ativo (RAF agendado).

#### Returns

`boolean`

***

### start()

> **start**(): `void`

Defined in: [presentation/app/GameLoop.ts:36](https://github.com/dantasgut/clayflow/blob/1e865e5867462e68c307a6f63f28da7ac030edf9/src/presentation/app/GameLoop.ts#L36)

Inicia o laço (RAF). No-op se já rodando.

#### Returns

`void`

***

### stop()

> **stop**(): `void`

Defined in: [presentation/app/GameLoop.ts:51](https://github.com/dantasgut/clayflow/blob/1e865e5867462e68c307a6f63f28da7ac030edf9/src/presentation/app/GameLoop.ts#L51)

Cancela o RAF agendado. No-op se não rodando.

#### Returns

`void`
