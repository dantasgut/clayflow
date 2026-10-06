[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / PointerDevice

# Class: PointerDevice

Defined in: [presentation/input/PointerDevice.ts:8](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/presentation/input/PointerDevice.ts#L8)

Device de mouse/touch unificado (Pointer Events API). Popula
`Input.state.pointerX/Y/Buttons/DeltaX/DeltaY/wheel`. Use deltas para
camera orbit; absolute coords para UI hit-testing.

## Constructors

### Constructor

> **new PointerDevice**(`canvas`, `input`): `PointerDevice`

Defined in: [presentation/input/PointerDevice.ts:9](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/presentation/input/PointerDevice.ts#L9)

#### Parameters

##### canvas

`HTMLCanvasElement`

##### input

[`Input`](Input.md)

#### Returns

`PointerDevice`

## Methods

### attach()

> **attach**(): `void`

Defined in: [presentation/input/PointerDevice.ts:15](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/presentation/input/PointerDevice.ts#L15)

Registra listeners no canvas.

#### Returns

`void`

***

### detach()

> **detach**(): `void`

Defined in: [presentation/input/PointerDevice.ts:23](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/presentation/input/PointerDevice.ts#L23)

Remove listeners.

#### Returns

`void`
