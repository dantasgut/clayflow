[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / InputDrivenController

# Abstract Class: InputDrivenController

Defined in: [presentation/input/InputDrivenController.ts:20](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/presentation/input/InputDrivenController.ts#L20)

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

### dispose()

> **dispose**(): `void`

Defined in: [presentation/input/InputDrivenController.ts:25](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/presentation/input/InputDrivenController.ts#L25)

Remove ouvintes de DOM que o controller registrou. Default: no-op.

#### Returns

`void`

***

### update()

> `abstract` **update**(`ctx`): `void`

Defined in: [presentation/input/InputDrivenController.ts:22](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/presentation/input/InputDrivenController.ts#L22)

Hook chamado a cada frameTick — leia input, atualize state externo.

#### Parameters

##### ctx

[`ControllerContext`](../interfaces/ControllerContext.md)

#### Returns

`void`
