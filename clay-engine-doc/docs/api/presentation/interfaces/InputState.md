[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / InputState

# Interface: InputState

Defined in: [presentation/input/Input.ts:10](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/input/Input.ts#L10)

State agregado de input — keyboard + pointer + wheel + pinch — atualizado
pelos input devices (KeyboardDevice, PointerDevice, TouchDevice) e
consumido por controllers (FlyController, OrbitController, FpsController).

Deltas (`pointerDeltaX/Y`, `wheel`, `pinchDelta`) acumulam entre frames
e são zerados via `consumeFrameDeltas()` (chamado pelo InteractionSystem
no fim de cada tick após controllers terem lido).

## Properties

### keys

> **keys**: `Set`\<`string`\>

Defined in: [presentation/input/Input.ts:12](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/input/Input.ts#L12)

Conjunto de codes (KeyboardEvent.code) atualmente pressionadas.

***

### pinchDelta

> **pinchDelta**: `number`

Defined in: [presentation/input/Input.ts:26](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/input/Input.ts#L26)

Variação de pinch (distance delta entre 2 dedos) consumida por frame.

***

### pointerButtons

> **pointerButtons**: `number`

Defined in: [presentation/input/Input.ts:22](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/input/Input.ts#L22)

Bitmask de botões pressionados (1=left, 2=right, 4=middle).

***

### pointerDeltaX

> **pointerDeltaX**: `number`

Defined in: [presentation/input/Input.ts:18](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/input/Input.ts#L18)

Delta X acumulado desde o último consumeFrameDeltas.

***

### pointerDeltaY

> **pointerDeltaY**: `number`

Defined in: [presentation/input/Input.ts:20](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/input/Input.ts#L20)

Delta Y acumulado.

***

### pointerX

> **pointerX**: `number`

Defined in: [presentation/input/Input.ts:14](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/input/Input.ts#L14)

Posição X do pointer em coords de canvas (último move).

***

### pointerY

> **pointerY**: `number`

Defined in: [presentation/input/Input.ts:16](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/input/Input.ts#L16)

Posição Y do pointer em coords de canvas.

***

### wheel

> **wheel**: `number`

Defined in: [presentation/input/Input.ts:24](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/input/Input.ts#L24)

Wheel delta acumulado (positive = scroll up).
