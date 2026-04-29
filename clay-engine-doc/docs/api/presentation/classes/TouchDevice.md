[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / TouchDevice

# Class: TouchDevice

Defined in: [presentation/input/TouchDevice.ts:9](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/input/TouchDevice.ts#L9)

Touch input → reflexo no Input.state. Suporta:
  - 1 dedo: atualiza pointerX/Y (paridade com mouse).
  - 2 dedos: pinch — incrementa state.pinchDelta com a variação da distância
    entre os 2 dedos (positivo = afastando = zoom-out).

## Constructors

### Constructor

> **new TouchDevice**(`canvas`, `input`): `TouchDevice`

Defined in: [presentation/input/TouchDevice.ts:12](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/input/TouchDevice.ts#L12)

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

Defined in: [presentation/input/TouchDevice.ts:14](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/input/TouchDevice.ts#L14)

#### Returns

`void`

***

### detach()

> **detach**(): `void`

Defined in: [presentation/input/TouchDevice.ts:21](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/input/TouchDevice.ts#L21)

#### Returns

`void`
