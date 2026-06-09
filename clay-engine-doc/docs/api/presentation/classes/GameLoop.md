[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / GameLoop

# Class: GameLoop

Defined in: [presentation/app/GameLoop.ts:15](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/app/GameLoop.ts#L15)

GameLoop encapsula o requestAnimationFrame loop. Cada frame:
  1. Computa `dt` (tempo desde último frame, clamped em 1/30 para
     evitar saltos enormes após pause/blur).
  2. Atualiza `Time.data.elapsed`.
  3. Emite `frameTick` event no EventBus.
  4. Agenda próximo RAF.

Application instancia + start/stop. ExecutionSystem ouve frameTick
para dispatch dos Flows.

## Constructors

### Constructor

> **new GameLoop**(`events`, `time`): `GameLoop`

Defined in: [presentation/app/GameLoop.ts:19](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/app/GameLoop.ts#L19)

#### Parameters

##### events

`EventBus`

##### time

[`Time`](Time.md)

#### Returns

`GameLoop`

## Methods

### isRunning()

> **isRunning**(): `boolean`

Defined in: [presentation/app/GameLoop.ts:47](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/app/GameLoop.ts#L47)

True se o loop está ativo (RAF agendado).

#### Returns

`boolean`

***

### start()

> **start**(): `void`

Defined in: [presentation/app/GameLoop.ts:25](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/app/GameLoop.ts#L25)

Inicia o RAF loop. No-op se já rodando.

#### Returns

`void`

***

### stop()

> **stop**(): `void`

Defined in: [presentation/app/GameLoop.ts:40](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/app/GameLoop.ts#L40)

Cancela o RAF agendado. No-op se não rodando.

#### Returns

`void`
