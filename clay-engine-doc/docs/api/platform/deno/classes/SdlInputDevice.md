[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/deno](../README.md) / SdlInputDevice

# Class: SdlInputDevice

Defined in: [src/platform/deno/SdlInputDevice.ts:37](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/deno/SdlInputDevice.ts#L37)

Entrada da janela SDL (spec 038, `clayflow/deno`): os eventos da janela no `Input` da cena e no barramento, com os
mesmos nomes e unidades da entrada do DOM — teclas por `KeyboardEvent.code`, botões 0/1/2 (esquerdo, meio, direito),
a roda em `deltaY` (positivo para baixo) — e os controllers (órbita, voo) funcionam igual nos dois ambientes.

## Implements

- [`InputDevice`](../../../presentation/interfaces/InputDevice.md)

## Constructors

### Constructor

> **new SdlInputDevice**(`input`, `events`): `SdlInputDevice`

Defined in: [src/platform/deno/SdlInputDevice.ts:40](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/deno/SdlInputDevice.ts#L40)

#### Parameters

##### input

[`Input`](../../../presentation/classes/Input.md)

##### events

[`EventBus`](../../web/interfaces/EventBus.md)

#### Returns

`SdlInputDevice`

## Methods

### attach()

> **attach**(): `void`

Defined in: [src/platform/deno/SdlInputDevice.ts:45](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/deno/SdlInputDevice.ts#L45)

Começa a ouvir o ambiente.

#### Returns

`void`

#### Implementation of

[`InputDevice`](../../../presentation/interfaces/InputDevice.md).[`attach`](../../../presentation/interfaces/InputDevice.md#attach)

***

### detach()

> **detach**(): `void`

Defined in: [src/platform/deno/SdlInputDevice.ts:49](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/deno/SdlInputDevice.ts#L49)

Para de ouvir (o descarte e o `detach` do sistema).

#### Returns

`void`

#### Implementation of

[`InputDevice`](../../../presentation/interfaces/InputDevice.md).[`detach`](../../../presentation/interfaces/InputDevice.md#detach)

***

### handle()

> **handle**(`events`): `void`

Defined in: [src/platform/deno/SdlInputDevice.ts:54](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/deno/SdlInputDevice.ts#L54)

Traduz os eventos de entrada da janela (o laço do Deno os entrega a cada quadro).

#### Parameters

##### events

readonly [`SdlEvent`](../type-aliases/SdlEvent.md)[]

#### Returns

`void`
