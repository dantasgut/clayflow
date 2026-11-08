[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [presentation](../README.md) / PointerInputEvent

# Interface: PointerInputEvent

Defined in: [src/presentation/input/InputEvents.ts:13](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/InputEvents.ts#L13)

Ponteiro: posição em coordenadas do canvas, deslocamento desde o último movimento e botão (`PointerEvent.button`).

## Properties

### button

> `readonly` **button**: `number`

Defined in: [src/presentation/input/InputEvents.ts:23](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/InputEvents.ts#L23)

Botão (`PointerEvent.button`: 0 esquerdo, 1 meio, 2 direito).

***

### dx

> `readonly` **dx**: `number`

Defined in: [src/presentation/input/InputEvents.ts:19](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/InputEvents.ts#L19)

Deslocamento horizontal desde o último movimento.

***

### dy

> `readonly` **dy**: `number`

Defined in: [src/presentation/input/InputEvents.ts:21](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/InputEvents.ts#L21)

Deslocamento vertical desde o último movimento.

***

### x

> `readonly` **x**: `number`

Defined in: [src/presentation/input/InputEvents.ts:15](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/InputEvents.ts#L15)

Posição horizontal no canvas, em pixels.

***

### y

> `readonly` **y**: `number`

Defined in: [src/presentation/input/InputEvents.ts:17](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/InputEvents.ts#L17)

Posição vertical no canvas, em pixels (para baixo).
