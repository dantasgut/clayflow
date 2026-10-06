[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / FpsController

# Class: FpsController

Defined in: [presentation/input/controllers/FpsController.ts:13](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/presentation/input/controllers/FpsController.ts#L13)

Base abstrata de controllers (OrbitController, FpsController, FlyController).
Subclasses implementam `update(ctx)` chamado pelo InteractionSystem
em cada tick. Lê `ctx.input` e modifica resources do World (Camera,
Transform) conforme input.

## Extends

- [`InputDrivenController`](InputDrivenController.md)

## Constructors

### Constructor

> **new FpsController**(`camera`, `options?`): `FpsController`

Defined in: [presentation/input/controllers/FpsController.ts:21](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/presentation/input/controllers/FpsController.ts#L21)

#### Parameters

##### camera

[`Camera`](../../elements/classes/Camera.md)

##### options?

`FpsControllerOptions` = `{}`

#### Returns

`FpsController`

#### Overrides

[`InputDrivenController`](InputDrivenController.md).[`constructor`](InputDrivenController.md#constructor)

## Methods

### update()

> **update**(`ctx`): `void`

Defined in: [presentation/input/controllers/FpsController.ts:49](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/presentation/input/controllers/FpsController.ts#L49)

Hook chamado a cada frameTick — leia input, atualize state externo.

#### Parameters

##### ctx

[`ControllerContext`](../interfaces/ControllerContext.md)

#### Returns

`void`

#### Overrides

[`InputDrivenController`](InputDrivenController.md).[`update`](InputDrivenController.md#update)
