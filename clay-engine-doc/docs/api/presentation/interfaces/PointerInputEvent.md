[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / PointerInputEvent

# Interface: PointerInputEvent

Defined in: [presentation/input/InputEvents.ts:13](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/input/InputEvents.ts#L13)

Ponteiro: posição em coordenadas do canvas, deslocamento desde o último movimento e botão (`PointerEvent.button`).

## Properties

### button

> `readonly` **button**: `number`

Defined in: [presentation/input/InputEvents.ts:23](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/input/InputEvents.ts#L23)

Botão (`PointerEvent.button`: 0 esquerdo, 1 meio, 2 direito).

***

### dx

> `readonly` **dx**: `number`

Defined in: [presentation/input/InputEvents.ts:19](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/input/InputEvents.ts#L19)

Deslocamento horizontal desde o último movimento.

***

### dy

> `readonly` **dy**: `number`

Defined in: [presentation/input/InputEvents.ts:21](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/input/InputEvents.ts#L21)

Deslocamento vertical desde o último movimento.

***

### x

> `readonly` **x**: `number`

Defined in: [presentation/input/InputEvents.ts:15](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/input/InputEvents.ts#L15)

Posição horizontal no canvas, em pixels.

***

### y

> `readonly` **y**: `number`

Defined in: [presentation/input/InputEvents.ts:17](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/input/InputEvents.ts#L17)

Posição vertical no canvas, em pixels (para baixo).
