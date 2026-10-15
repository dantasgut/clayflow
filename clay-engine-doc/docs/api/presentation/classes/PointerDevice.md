[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / PointerDevice

# Class: PointerDevice

Defined in: [presentation/input/PointerDevice.ts:9](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/input/PointerDevice.ts#L9)

Device de mouse/touch unificado (Pointer Events API). Popula `Input.current.pointerX/Y/Buttons/DeltaX/DeltaY/wheel`
(deltas para a órbita da câmera; coordenadas absolutas para UI) e emite `pointerDown`/`pointerUp`/`pointerMove`/
`wheel` no barramento, quando dado.

## Constructors

### Constructor

> **new PointerDevice**(`canvas`, `input`, `events?`): `PointerDevice`

Defined in: [presentation/input/PointerDevice.ts:10](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/input/PointerDevice.ts#L10)

#### Parameters

##### canvas

`HTMLCanvasElement`

##### input

[`Input`](Input.md)

##### events?

`EventBus`

#### Returns

`PointerDevice`

## Methods

### attach()

> **attach**(): `void`

Defined in: [presentation/input/PointerDevice.ts:17](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/input/PointerDevice.ts#L17)

Registra listeners no canvas.

#### Returns

`void`

***

### detach()

> **detach**(): `void`

Defined in: [presentation/input/PointerDevice.ts:25](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/input/PointerDevice.ts#L25)

Remove listeners.

#### Returns

`void`
