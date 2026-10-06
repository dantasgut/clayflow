[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / InputDrivenController

# Abstract Class: InputDrivenController

Defined in: [presentation/input/InputDrivenController.ts:20](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/presentation/input/InputDrivenController.ts#L20)

Base abstrata de controllers (OrbitController, FpsController, FlyController).
Subclasses implementam `update(ctx)` chamado pelo InteractionSystem
em cada tick. Lê `ctx.input` e modifica resources do World (Camera,
Transform) conforme input.

## Extended by

- [`OrbitController`](OrbitController.md)
- [`FpsController`](FpsController.md)
- [`FlyController`](FlyController.md)

## Constructors

### Constructor

> **new InputDrivenController**(): `InputDrivenController`

#### Returns

`InputDrivenController`

## Methods

### update()

> `abstract` **update**(`ctx`): `void`

Defined in: [presentation/input/InputDrivenController.ts:22](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/presentation/input/InputDrivenController.ts#L22)

Hook chamado a cada frameTick — leia input, atualize state externo.

#### Parameters

##### ctx

[`ControllerContext`](../interfaces/ControllerContext.md)

#### Returns

`void`
