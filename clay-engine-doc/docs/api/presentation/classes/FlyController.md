[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / FlyController

# Class: FlyController

Defined in: [presentation/input/controllers/FlyController.ts:30](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/presentation/input/controllers/FlyController.ts#L30)

Base abstrata de controllers (OrbitController, FpsController, FlyController).
Subclasses implementam `update(ctx)` chamado pelo InteractionSystem
em cada tick. Lê `ctx.input` e modifica resources do World (Camera,
Transform) conforme input.

## Extends

- [`InputDrivenController`](InputDrivenController.md)

## Constructors

### Constructor

> **new FlyController**(`camera`, `options?`): `FlyController`

Defined in: [presentation/input/controllers/FlyController.ts:38](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/presentation/input/controllers/FlyController.ts#L38)

#### Parameters

##### camera

[`Camera`](../../elements/classes/Camera.md)

##### options?

`FlyControllerOptions` = `{}`

#### Returns

`FlyController`

#### Overrides

[`InputDrivenController`](InputDrivenController.md).[`constructor`](InputDrivenController.md#constructor)

## Methods

### update()

> **update**(`ctx`): `void`

Defined in: [presentation/input/controllers/FlyController.ts:55](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/presentation/input/controllers/FlyController.ts#L55)

Hook chamado a cada frameTick — leia input, atualize state externo.

#### Parameters

##### ctx

[`ControllerContext`](../interfaces/ControllerContext.md)

#### Returns

`void`

#### Overrides

[`InputDrivenController`](InputDrivenController.md).[`update`](InputDrivenController.md#update)
