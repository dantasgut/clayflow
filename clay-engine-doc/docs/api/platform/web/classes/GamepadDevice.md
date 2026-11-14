[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / GamepadDevice

# Class: GamepadDevice

Defined in: [src/platform/web/input/GamepadDevice.ts:8](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/input/GamepadDevice.ts#L8)

Gamepads do navegador (spec 038): ligado, registra no `Input` a leitura da Gamepad API (`navigator.getGamepads`, por
consulta — a API não emite eventos de eixo nem de botão); desligado, a tira. `poll()` devolve os conectados.

## Implements

- [`InputDevice`](../../../presentation/interfaces/InputDevice.md)

## Constructors

### Constructor

> **new GamepadDevice**(`input?`): `GamepadDevice`

Defined in: [src/platform/web/input/GamepadDevice.ts:9](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/input/GamepadDevice.ts#L9)

#### Parameters

##### input?

[`Input`](../../../presentation/classes/Input.md)

#### Returns

`GamepadDevice`

## Methods

### attach()

> **attach**(): `void`

Defined in: [src/platform/web/input/GamepadDevice.ts:11](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/input/GamepadDevice.ts#L11)

Começa a ouvir o ambiente.

#### Returns

`void`

#### Implementation of

[`InputDevice`](../../../presentation/interfaces/InputDevice.md).[`attach`](../../../presentation/interfaces/InputDevice.md#attach)

***

### detach()

> **detach**(): `void`

Defined in: [src/platform/web/input/GamepadDevice.ts:19](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/input/GamepadDevice.ts#L19)

Para de ouvir (o descarte e o `detach` do sistema).

#### Returns

`void`

#### Implementation of

[`InputDevice`](../../../presentation/interfaces/InputDevice.md).[`detach`](../../../presentation/interfaces/InputDevice.md#detach)

***

### poll()

> **poll**(): readonly `Gamepad`[]

Defined in: [src/platform/web/input/GamepadDevice.ts:24](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/input/GamepadDevice.ts#L24)

Snapshot dos gamepads atualmente conectados (filtra slots vazios).

#### Returns

readonly `Gamepad`[]
