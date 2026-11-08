[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/deno](../README.md) / SdlEvent

# Type Alias: SdlEvent

> **SdlEvent** = \{ `kind`: `"quit"`; \} \| \{ `kind`: `"resized"`; \} \| \{ `down`: `boolean`; `kind`: `"key"`; `repeat`: `boolean`; `scancode`: `number`; \} \| \{ `dx`: `number`; `dy`: `number`; `kind`: `"motion"`; `x`: `number`; `y`: `number`; \} \| \{ `button`: `number`; `down`: `boolean`; `kind`: `"button"`; `x`: `number`; `y`: `number`; \} \| \{ `dx`: `number`; `dy`: `number`; `kind`: `"wheel"`; \}

Defined in: [src/platform/deno/sdl.ts:62](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/deno/sdl.ts#L62)

Os eventos da janela que o motor traduz (os campos do `SDL_Event` da SDL2 por deslocamento).
