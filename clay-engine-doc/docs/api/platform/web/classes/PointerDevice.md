[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / PointerDevice

# Class: PointerDevice

Defined in: [src/platform/web/input/PointerDevice.ts:9](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/input/PointerDevice.ts#L9)

Device de mouse/touch unificado (Pointer Events API). Popula `Input.current.pointerX/Y/Buttons/DeltaX/DeltaY/wheel`
(deltas para a órbita da câmera; coordenadas absolutas para UI) e emite `pointerDown`/`pointerUp`/`pointerMove`/
`wheel` no barramento, quando dado.

## Constructors

### Constructor

> **new PointerDevice**(`canvas`, `input`, `events?`): `PointerDevice`

Defined in: [src/platform/web/input/PointerDevice.ts:10](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/input/PointerDevice.ts#L10)

#### Parameters

##### canvas

`HTMLCanvasElement`

##### input

[`Input`](../../../presentation/classes/Input.md)

##### events?

[`EventBus`](../interfaces/EventBus.md)

#### Returns

`PointerDevice`

## Methods

### attach()

> **attach**(): `void`

Defined in: [src/platform/web/input/PointerDevice.ts:17](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/input/PointerDevice.ts#L17)

Registra listeners no canvas.

#### Returns

`void`

***

### detach()

> **detach**(): `void`

Defined in: [src/platform/web/input/PointerDevice.ts:25](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/input/PointerDevice.ts#L25)

Remove listeners.

#### Returns

`void`
