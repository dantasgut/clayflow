[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [presentation](../README.md) / InputDevice

# Interface: InputDevice

Defined in: [src/presentation/input/InputDevice.ts:6](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/InputDevice.ts#L6)

Um dispositivo de entrada (spec 038): escreve no `Input` da cena e emite os eventos de entrada no barramento a partir
do que o ambiente entrega — o DOM no navegador (`clayflow/web`: teclado, ponteiro, toque), a janela SDL no Deno
(`clayflow/deno`). O `InteractionSystem` liga e desliga os dispositivos que o ponto de entrada lhe dá.

## Methods

### attach()

> **attach**(): `void`

Defined in: [src/presentation/input/InputDevice.ts:8](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/InputDevice.ts#L8)

Começa a ouvir o ambiente.

#### Returns

`void`

***

### detach()

> **detach**(): `void`

Defined in: [src/presentation/input/InputDevice.ts:10](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/InputDevice.ts#L10)

Para de ouvir (o descarte e o `detach` do sistema).

#### Returns

`void`
