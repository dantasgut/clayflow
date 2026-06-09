[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / InteractionSystem

# Class: InteractionSystem

Defined in: [presentation/input/InteractionSystem.ts:31](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/input/InteractionSystem.ts#L31)

InteractionSystem encapsula todos os input devices (keyboard, pointer,
touch, gamepad) num Input shared state. Tick por frame propaga state
para controllers registrados (FlyController, OrbitController, etc.).

Lifecycle:
  1. `new InteractionSystem({canvas, window}, events)`.
  2. `attach()` — registra DOM listeners (keydown, pointermove, etc.).
  3. `addController(c)` — controllers reagem ao input em cada tick.
  4. `detach()` — limpa listeners (chamado pelo plugin dispose).

## Constructors

### Constructor

> **new InteractionSystem**(`options`, `events`): `InteractionSystem`

Defined in: [presentation/input/InteractionSystem.ts:44](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/input/InteractionSystem.ts#L44)

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

Defined in: [presentation/input/InteractionSystem.ts:41](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/input/InteractionSystem.ts#L41)

GamepadDevice — polling-based (Gamepad API não dispatch events).

***

### input

> `readonly` **input**: [`Input`](Input.md)

Defined in: [presentation/input/InteractionSystem.ts:33](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/input/InteractionSystem.ts#L33)

Input state shared entre devices e controllers.

***

### keyboard

> `readonly` **keyboard**: [`KeyboardDevice`](KeyboardDevice.md)

Defined in: [presentation/input/InteractionSystem.ts:35](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/input/InteractionSystem.ts#L35)

KeyboardDevice — captura keydown/keyup no `window`.

***

### pointer

> `readonly` **pointer**: [`PointerDevice`](PointerDevice.md)

Defined in: [presentation/input/InteractionSystem.ts:37](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/input/InteractionSystem.ts#L37)

PointerDevice — captura pointer events no canvas (mouse, pen).

***

### touch

> `readonly` **touch**: [`TouchDevice`](TouchDevice.md)

Defined in: [presentation/input/InteractionSystem.ts:39](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/input/InteractionSystem.ts#L39)

TouchDevice — captura touch events (multi-touch + pinch).

## Methods

### addController()

> **addController**(`controller`): `void`

Defined in: [presentation/input/InteractionSystem.ts:77](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/input/InteractionSystem.ts#L77)

Adiciona um controller que será atualizado a cada frameTick. Common
controllers: OrbitController, FpsController, FlyController.

#### Parameters

##### controller

[`InputDrivenController`](InputDrivenController.md)

#### Returns

`void`

***

### attach()

> **attach**(): `void`

Defined in: [presentation/input/InteractionSystem.ts:60](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/input/InteractionSystem.ts#L60)

Registra DOM event listeners. Chamar uma vez após construção.

#### Returns

`void`

***

### detach()

> **detach**(): `void`

Defined in: [presentation/input/InteractionSystem.ts:67](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/input/InteractionSystem.ts#L67)

Remove DOM listeners. Chamar antes de descartar o InteractionSystem.

#### Returns

`void`
