[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / InteractionSystem

# Class: InteractionSystem

Defined in: [presentation/input/InteractionSystem.ts:14](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/input/InteractionSystem.ts#L14)

## Constructors

### Constructor

> **new InteractionSystem**(`options`, `events`): `InteractionSystem`

Defined in: [presentation/input/InteractionSystem.ts:22](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/input/InteractionSystem.ts#L22)

#### Parameters

##### options

[`InteractionSystemOptions`](../interfaces/InteractionSystemOptions.md)

##### events

`EventBus`

#### Returns

`InteractionSystem`

## Properties

### gamepad

> `readonly` **gamepad**: [`GamepadDevice`](GamepadDevice.md)

Defined in: [presentation/input/InteractionSystem.ts:19](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/input/InteractionSystem.ts#L19)

***

### input

> `readonly` **input**: [`Input`](Input.md)

Defined in: [presentation/input/InteractionSystem.ts:15](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/input/InteractionSystem.ts#L15)

***

### keyboard

> `readonly` **keyboard**: [`KeyboardDevice`](KeyboardDevice.md)

Defined in: [presentation/input/InteractionSystem.ts:16](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/input/InteractionSystem.ts#L16)

***

### pointer

> `readonly` **pointer**: [`PointerDevice`](PointerDevice.md)

Defined in: [presentation/input/InteractionSystem.ts:17](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/input/InteractionSystem.ts#L17)

***

### touch

> `readonly` **touch**: [`TouchDevice`](TouchDevice.md)

Defined in: [presentation/input/InteractionSystem.ts:18](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/input/InteractionSystem.ts#L18)

## Methods

### addController()

> **addController**(`controller`): `void`

Defined in: [presentation/input/InteractionSystem.ts:44](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/input/InteractionSystem.ts#L44)

#### Parameters

##### controller

[`InputDrivenController`](InputDrivenController.md)

#### Returns

`void`

***

### attach()

> **attach**(): `void`

Defined in: [presentation/input/InteractionSystem.ts:32](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/input/InteractionSystem.ts#L32)

#### Returns

`void`

***

### detach()

> **detach**(): `void`

Defined in: [presentation/input/InteractionSystem.ts:38](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/input/InteractionSystem.ts#L38)

#### Returns

`void`
