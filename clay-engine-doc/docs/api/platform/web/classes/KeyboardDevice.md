[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / KeyboardDevice

# Class: KeyboardDevice

Defined in: [src/platform/web/input/KeyboardDevice.ts:8](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/input/KeyboardDevice.ts#L8)

Device de teclado — captura keydown/keyup no target (window/element), popula `Input.current.keys` (Set de
KeyboardEvent.code; consulta por `input.isKeyDown(code)`) e emite `keyDown`/`keyUp` no barramento, quando dado.

## Constructors

### Constructor

> **new KeyboardDevice**(`target`, `input`, `events?`): `KeyboardDevice`

Defined in: [src/platform/web/input/KeyboardDevice.ts:9](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/input/KeyboardDevice.ts#L9)

#### Parameters

##### target

`HTMLElement` \| `Window`

##### input

[`Input`](../../../presentation/classes/Input.md)

##### events?

[`EventBus`](../interfaces/EventBus.md)

#### Returns

`KeyboardDevice`

## Methods

### attach()

> **attach**(): `void`

Defined in: [src/platform/web/input/KeyboardDevice.ts:16](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/input/KeyboardDevice.ts#L16)

Registra listeners no target. Chamado pelo Application após `start()`.

#### Returns

`void`

***

### detach()

> **detach**(): `void`

Defined in: [src/platform/web/input/KeyboardDevice.ts:23](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/input/KeyboardDevice.ts#L23)

Remove listeners. Chamado em `Application.dispose()`.

#### Returns

`void`
