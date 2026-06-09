[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / OrbitController

# Class: OrbitController

Defined in: [presentation/input/controllers/OrbitController.ts:30](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/input/controllers/OrbitController.ts#L30)

OrbitController com damping (inércia) por canal: theta, phi, distance.
Cada canal acumula `velocity_X = lerp(velocity_X, raw_input, damping)` por
frame, decaindo gradualmente após o usuário soltar. Suporta pinch-zoom
(touch) consumindo `input.state.pinchDelta`.

## Extends

- [`InputDrivenController`](InputDrivenController.md)

## Constructors

### Constructor

> **new OrbitController**(`camera`, `options?`): `OrbitController`

Defined in: [presentation/input/controllers/OrbitController.ts:43](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/input/controllers/OrbitController.ts#L43)

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

Defined in: [presentation/input/controllers/OrbitController.ts:61](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/input/controllers/OrbitController.ts#L61)

Atualiza Camera per-frame. Lê input deltas (drag, wheel, pinch),
injeta velocidades em theta/phi/distance, integra com damping,
recalcula camera.position via spherical → cartesian.

#### Parameters

##### ctx

[`ControllerContext`](../interfaces/ControllerContext.md)

#### Returns

`void`

#### Overrides

[`InputDrivenController`](InputDrivenController.md).[`update`](InputDrivenController.md#update)
