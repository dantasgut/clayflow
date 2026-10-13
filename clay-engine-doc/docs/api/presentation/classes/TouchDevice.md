[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / TouchDevice

# Class: TouchDevice

Defined in: [presentation/input/TouchDevice.ts:9](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/presentation/input/TouchDevice.ts#L9)

Touch input → reflexo no Input.state. Suporta:
  - 1 dedo: atualiza pointerX/Y (paridade com mouse).
  - 2 dedos: pinch — incrementa state.pinchDelta com a variação da distância
    entre os 2 dedos (positivo = afastando = zoom-out).

## Constructors

### Constructor

> **new TouchDevice**(`canvas`, `input`): `TouchDevice`

Defined in: [presentation/input/TouchDevice.ts:12](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/presentation/input/TouchDevice.ts#L12)

#### Parameters

##### canvas

`HTMLCanvasElement`

##### input

[`Input`](Input.md)

#### Returns

`TouchDevice`

## Methods

### attach()

> **attach**(): `void`

Defined in: [presentation/input/TouchDevice.ts:18](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/presentation/input/TouchDevice.ts#L18)

Registra listeners de touch no canvas.

#### Returns

`void`

***

### detach()

> **detach**(): `void`

Defined in: [presentation/input/TouchDevice.ts:26](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/presentation/input/TouchDevice.ts#L26)

Remove listeners de touch.

#### Returns

`void`
