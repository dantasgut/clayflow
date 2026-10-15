[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / InteractionSystem

# Class: InteractionSystem

Defined in: [presentation/input/InteractionSystem.ts:38](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/input/InteractionSystem.ts#L38)

InteractionSystem (spec 007) — liga os dispositivos (teclado, ponteiro, toque, gamepad) ao `Input` da cena e, a cada
`frameTick`, chama `tick(input, dt, transform)` de cada controller do World (componente da entidade da câmera) com o
`Transform` da mesma entidade; depois zera os deltas do quadro. Os controllers são mantidos por eventos do World
(`entitiesInserted`/`entitiesRemoved`) — o quadro não percorre a cena. Um controller sem `Transform` na entidade é
erro (nomeia a entidade); o que sai da cena é descartado (ouvintes de DOM).

Criado pela `Application` (um por cena).

## Constructors

### Constructor

> **new InteractionSystem**(`options`, `events`, `world`, `input`): `InteractionSystem`

Defined in: [presentation/input/InteractionSystem.ts:50](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/input/InteractionSystem.ts#L50)

#### Parameters

##### options

[`InteractionSystemOptions`](../interfaces/InteractionSystemOptions.md)

##### events

`EventBus`

##### world

`World`

##### input

[`Input`](Input.md)

`Input` da cena (inserido no World pela `Application`).

#### Returns

`InteractionSystem`

## Properties

### gamepad

> `readonly` **gamepad**: [`GamepadDevice`](GamepadDevice.md)

Defined in: [presentation/input/InteractionSystem.ts:46](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/input/InteractionSystem.ts#L46)

GamepadDevice — polling-based (Gamepad API não dispatch events).

***

### input

> `readonly` **input**: [`Input`](Input.md)

Defined in: [presentation/input/InteractionSystem.ts:55](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/input/InteractionSystem.ts#L55)

`Input` da cena (inserido no World pela `Application`).

***

### keyboard

> `readonly` **keyboard**: [`KeyboardDevice`](KeyboardDevice.md)

Defined in: [presentation/input/InteractionSystem.ts:40](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/input/InteractionSystem.ts#L40)

KeyboardDevice — captura keydown/keyup no `window`.

***

### pointer

> `readonly` **pointer**: [`PointerDevice`](PointerDevice.md)

Defined in: [presentation/input/InteractionSystem.ts:42](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/input/InteractionSystem.ts#L42)

PointerDevice — captura pointer events no canvas (mouse, pen).

***

### touch

> `readonly` **touch**: [`TouchDevice`](TouchDevice.md)

Defined in: [presentation/input/InteractionSystem.ts:44](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/input/InteractionSystem.ts#L44)

TouchDevice — captura touch events (multi-touch + pinch).

## Methods

### attach()

> **attach**(): `void`

Defined in: [presentation/input/InteractionSystem.ts:88](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/input/InteractionSystem.ts#L88)

Registra DOM event listeners (e reativa a atualização por quadro depois de um `detach`).

#### Returns

`void`

***

### detach()

> **detach**(): `void`

Defined in: [presentation/input/InteractionSystem.ts:96](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/input/InteractionSystem.ts#L96)

Remove os ouvintes de DOM e as inscrições no barramento. Chamar antes de descartar o InteractionSystem.

#### Returns

`void`

***

### dispose()

> **dispose**(): `void`

Defined in: [presentation/input/InteractionSystem.ts:105](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/input/InteractionSystem.ts#L105)

Descarte: `detach` e descarte dos controllers da cena (ouvintes de DOM deles).

#### Returns

`void`
