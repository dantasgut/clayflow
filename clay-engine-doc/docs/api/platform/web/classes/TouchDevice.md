[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / TouchDevice

# Class: TouchDevice

Defined in: [src/platform/web/input/TouchDevice.ts:9](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/input/TouchDevice.ts#L9)

Touch input → reflexo no `Input.current`. Suporta:
  - 1 dedo: atualiza pointerX/Y (paridade com mouse).
  - 2 dedos: pinch — incrementa state.pinchDelta com a variação da distância
    entre os 2 dedos (positivo = afastando = zoom-out).

## Constructors

### Constructor

> **new TouchDevice**(`canvas`, `input`): `TouchDevice`

Defined in: [src/platform/web/input/TouchDevice.ts:12](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/input/TouchDevice.ts#L12)

#### Parameters

##### canvas

`HTMLCanvasElement`

##### input

[`Input`](../../../presentation/classes/Input.md)

#### Returns

`TouchDevice`

## Methods

### attach()

> **attach**(): `void`

Defined in: [src/platform/web/input/TouchDevice.ts:18](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/input/TouchDevice.ts#L18)

Registra listeners de touch no canvas.

#### Returns

`void`

***

### detach()

> **detach**(): `void`

Defined in: [src/platform/web/input/TouchDevice.ts:26](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/input/TouchDevice.ts#L26)

Remove listeners de touch.

#### Returns

`void`
