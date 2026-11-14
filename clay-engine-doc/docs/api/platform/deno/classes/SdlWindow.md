[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/deno](../README.md) / SdlWindow

# Class: SdlWindow

Defined in: [src/platform/deno/sdl.ts:108](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/deno/sdl.ts#L108)

Uma janela SDL2 com os handles para a superfície WebGPU do Deno.

## Constructors

### Constructor

> **new SdlWindow**(`title`, `width`, `height`, `highDpi?`): `SdlWindow`

Defined in: [src/platform/deno/sdl.ts:119](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/deno/sdl.ts#L119)

#### Parameters

##### title

`string`

##### width

`number`

##### height

`number`

##### highDpi?

`boolean` = `true`

#### Returns

`SdlWindow`

## Properties

### handle

> `readonly` **handle**: `unknown`

Defined in: [src/platform/deno/sdl.ts:114](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/deno/sdl.ts#L114)

## Methods

### close()

> **close**(): `void`

Defined in: [src/platform/deno/sdl.ts:240](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/deno/sdl.ts#L240)

Fecha a janela e a SDL (idempotente).

#### Returns

`void`

***

### nativeHandles()

> **nativeHandles**(): `object`

Defined in: [src/platform/deno/sdl.ts:151](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/deno/sdl.ts#L151)

Os handles nativos para `Deno.UnsafeWindowSurface` (o sistema, a janela e o display).

#### Returns

`object`

##### displayHandle

> **displayHandle**: `unknown`

##### system

> **system**: `"cocoa"` \| `"win32"` \| `"x11"` \| `"wayland"`

##### windowHandle

> **windowHandle**: `unknown`

***

### pixelSize()

> **pixelSize**(): `object`

Defined in: [src/platform/deno/sdl.ts:187](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/deno/sdl.ts#L187)

O tamanho da janela em pixels (o do quadro; em telas de alta densidade, maior que o em pontos).

#### Returns

`object`

##### height

> **height**: `number`

##### width

> **width**: `number`

***

### poll()

> **poll**(): [`SdlEvent`](../type-aliases/SdlEvent.md)[]

Defined in: [src/platform/deno/sdl.ts:195](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/deno/sdl.ts#L195)

Os eventos pendentes, traduzidos (os de outros tipos são descartados).

#### Returns

[`SdlEvent`](../type-aliases/SdlEvent.md)[]
