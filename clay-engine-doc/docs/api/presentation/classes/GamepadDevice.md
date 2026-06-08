[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / GamepadDevice

# Class: GamepadDevice

Defined in: [presentation/input/GamepadDevice.ts:6](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/input/GamepadDevice.ts#L6)

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

Defined in: [presentation/input/GamepadDevice.ts:8](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/input/GamepadDevice.ts#L8)

Snapshot dos gamepads atualmente conectados (filtra slots vazios).

#### Returns

readonly `Gamepad`[]
