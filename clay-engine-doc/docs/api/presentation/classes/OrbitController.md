[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / OrbitController

# Class: OrbitController

Defined in: [presentation/input/controllers/OrbitController.ts:23](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/input/controllers/OrbitController.ts#L23)

OrbitController com damping (inércia) por canal: theta, phi, distance.
Cada canal acumula `velocity_X = lerp(velocity_X, raw_input, damping)` por
frame, decaindo gradualmente após o usuário soltar. Suporta pinch-zoom
(touch) consumindo `input.state.pinchDelta`.

## Extends

- [`InputDrivenController`](InputDrivenController.md)

## Constructors

### Constructor

> **new OrbitController**(`camera`, `options?`): `OrbitController`

Defined in: [presentation/input/controllers/OrbitController.ts:36](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/input/controllers/OrbitController.ts#L36)

#### Parameters

##### camera

[`Camera`](../../elements/classes/Camera.md)

##### options?

[`OrbitControllerOptions`](../interfaces/OrbitControllerOptions.md) = `{}`

#### Returns

`OrbitController`

#### Overrides

[`InputDrivenController`](InputDrivenController.md).[`constructor`](InputDrivenController.md#constructor)

## Methods

### update()

> **update**(`ctx`): `void`

Defined in: [presentation/input/controllers/OrbitController.ts:46](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/input/controllers/OrbitController.ts#L46)

#### Parameters

##### ctx

[`ControllerContext`](../interfaces/ControllerContext.md)

#### Returns

`void`

#### Overrides

[`InputDrivenController`](InputDrivenController.md).[`update`](InputDrivenController.md#update)
