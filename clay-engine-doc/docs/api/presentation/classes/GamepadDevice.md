[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / GamepadDevice

# Class: GamepadDevice

Defined in: [presentation/input/GamepadDevice.ts:6](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/presentation/input/GamepadDevice.ts#L6)

Gamepad polling — Gamepad API não emite eventos para axis/button
changes, então o app deve chamar `poll()` a cada frame para ler estado
atual de todos os gamepads conectados.

## Constructors

### Constructor

> **new GamepadDevice**(): `GamepadDevice`

#### Returns

`GamepadDevice`

## Methods

### poll()

> **poll**(): readonly `Gamepad`[]

Defined in: [presentation/input/GamepadDevice.ts:8](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/presentation/input/GamepadDevice.ts#L8)

Snapshot dos gamepads atualmente conectados (filtra slots vazios).

#### Returns

readonly `Gamepad`[]
