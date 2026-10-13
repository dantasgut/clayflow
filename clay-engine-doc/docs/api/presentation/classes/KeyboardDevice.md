[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / KeyboardDevice

# Class: KeyboardDevice

Defined in: [presentation/input/KeyboardDevice.ts:8](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/presentation/input/KeyboardDevice.ts#L8)

Device de teclado — captura keydown/keyup no target (window/element), popula `Input.current.keys` (Set de
KeyboardEvent.code; consulta por `input.isKeyDown(code)`) e emite `keyDown`/`keyUp` no barramento, quando dado.

## Constructors

### Constructor

> **new KeyboardDevice**(`target`, `input`, `events?`): `KeyboardDevice`

Defined in: [presentation/input/KeyboardDevice.ts:9](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/presentation/input/KeyboardDevice.ts#L9)

#### Parameters

##### target

`HTMLElement` \| `Window`

##### input

[`Input`](Input.md)

##### events?

`EventBus`

#### Returns

`KeyboardDevice`

## Methods

### attach()

> **attach**(): `void`

Defined in: [presentation/input/KeyboardDevice.ts:16](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/presentation/input/KeyboardDevice.ts#L16)

Registra listeners no target. Chamado pelo Application após `start()`.

#### Returns

`void`

***

### detach()

> **detach**(): `void`

Defined in: [presentation/input/KeyboardDevice.ts:23](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/presentation/input/KeyboardDevice.ts#L23)

Remove listeners. Chamado em `Application.dispose()`.

#### Returns

`void`
