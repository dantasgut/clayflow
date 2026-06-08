[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / KeyboardDevice

# Class: KeyboardDevice

Defined in: [presentation/input/KeyboardDevice.ts:8](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/input/KeyboardDevice.ts#L8)

Device de teclado — captura keydown/keyup no target (window/element) e
popula `Input.state.keys` (Set de KeyboardEvent.code). Use `input.isDown(code)`
para queries no game loop.

## Constructors

### Constructor

> **new KeyboardDevice**(`target`, `input`): `KeyboardDevice`

Defined in: [presentation/input/KeyboardDevice.ts:9](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/input/KeyboardDevice.ts#L9)

#### Parameters

##### target

`HTMLElement` \| `Window`

##### input

[`Input`](Input.md)

#### Returns

`KeyboardDevice`

## Methods

### attach()

> **attach**(): `void`

Defined in: [presentation/input/KeyboardDevice.ts:15](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/input/KeyboardDevice.ts#L15)

Registra listeners no target. Chamado pelo Application após `start()`.

#### Returns

`void`

***

### detach()

> **detach**(): `void`

Defined in: [presentation/input/KeyboardDevice.ts:22](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/input/KeyboardDevice.ts#L22)

Remove listeners. Chamado em `Application.dispose()`.

#### Returns

`void`
