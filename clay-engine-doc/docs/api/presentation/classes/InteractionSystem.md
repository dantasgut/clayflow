[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [presentation](../README.md) / InteractionSystem

# Class: InteractionSystem

Defined in: [src/presentation/input/InteractionSystem.ts:25](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/InteractionSystem.ts#L25)

InteractionSystem (spec 007) — liga os dispositivos de entrada do ambiente (spec 038: os do DOM no navegador, os da
janela no Deno) ao `Input` da cena e, a cada
`frameTick`, chama `tick(input, dt, transform)` de cada controller do World (componente da entidade da câmera) com o
`Transform` da mesma entidade; depois zera os deltas do quadro. Os controllers são mantidos por eventos do World
(`entitiesInserted`/`entitiesRemoved`) — o quadro não percorre a cena. Um controller sem `Transform` na entidade é
erro (nomeia a entidade); o que sai da cena é descartado (ouvintes de DOM).

Criado pela `Application` (um por cena).

## Constructors

### Constructor

> **new InteractionSystem**(`devices`, `events`, `world`, `input`): `InteractionSystem`

Defined in: [src/presentation/input/InteractionSystem.ts:31](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/InteractionSystem.ts#L31)

#### Parameters

##### devices

readonly [`InputDevice`](../interfaces/InputDevice.md)[]

##### events

[`EventBus`](../../platform/web/interfaces/EventBus.md)

##### world

[`World`](../../platform/web/classes/World.md)

##### input

[`Input`](Input.md)

`Input` da cena (inserido no World pela `Application`).

#### Returns

`InteractionSystem`

## Properties

### devices

> `readonly` **devices**: readonly [`InputDevice`](../interfaces/InputDevice.md)[]

Defined in: [src/presentation/input/InteractionSystem.ts:27](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/InteractionSystem.ts#L27)

Os dispositivos de entrada do ambiente (o ponto de entrada os dá).

***

### input

> `readonly` **input**: [`Input`](Input.md)

Defined in: [src/presentation/input/InteractionSystem.ts:36](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/InteractionSystem.ts#L36)

`Input` da cena (inserido no World pela `Application`).

## Methods

### attach()

> **attach**(): `void`

Defined in: [src/presentation/input/InteractionSystem.ts:65](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/InteractionSystem.ts#L65)

Liga os dispositivos (e reativa a atualização por quadro depois de um `detach`).

#### Returns

`void`

***

### detach()

> **detach**(): `void`

Defined in: [src/presentation/input/InteractionSystem.ts:71](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/InteractionSystem.ts#L71)

Desliga os dispositivos e as inscrições no barramento. Chamar antes de descartar o InteractionSystem.

#### Returns

`void`

***

### dispose()

> **dispose**(): `void`

Defined in: [src/presentation/input/InteractionSystem.ts:78](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/InteractionSystem.ts#L78)

Descarte: `detach` e descarte dos controllers da cena (ouvintes de DOM deles).

#### Returns

`void`
