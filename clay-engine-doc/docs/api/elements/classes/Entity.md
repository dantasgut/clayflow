[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / Entity

# Abstract Class: Entity

Defined in: [scene/contracts/Entity.ts:1](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/scene/contracts/Entity.ts#L1)

## Extended by

- [`PostProcessEffect`](../../presentation/classes/PostProcessEffect.md)
- [`Time`](../../presentation/classes/Time.md)
- [`Scene`](Scene.md)
- [`Transform`](Transform.md)
- [`Camera`](Camera.md)
- [`Light`](Light.md)
- [`ShadowMap`](ShadowMap.md)
- [`CanvasRenderTarget`](CanvasRenderTarget.md)
- [`OffscreenRenderTarget`](OffscreenRenderTarget.md)
- [`Geometry`](Geometry.md)
- [`Material`](Material.md)
- [`PhysicsBody`](PhysicsBody.md)
- [`ForceField`](ForceField.md)
- [`Collider`](Collider.md)
- [`Constraint`](Constraint.md)
- [`ParticleEmitter`](ParticleEmitter.md)
- [`NeighborSearchGrid`](NeighborSearchGrid.md)
- [`EulerianGrid`](EulerianGrid.md)

## Constructors

### Constructor

> **new Entity**(): `Entity`

#### Returns

`Entity`

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly `Entity`[]

Defined in: [scene/contracts/Entity.ts:9](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/scene/contracts/Entity.ts#L9)

##### Returns

readonly `Entity`[]

## Methods

### add()

> **add**(`e`): `this`

Defined in: [scene/contracts/Entity.ts:4](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/scene/contracts/Entity.ts#L4)

#### Parameters

##### e

`Entity`

#### Returns

`this`
