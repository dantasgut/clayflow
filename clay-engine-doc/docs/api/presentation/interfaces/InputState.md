[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / InputState

# Interface: InputState

Defined in: [presentation/input/Input.ts:14](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/input/Input.ts#L14)

Estado agregado de entrada — teclado, ponteiro, roda e pinça — escrito pelos dispositivos
(`KeyboardDevice`, `PointerDevice`, `TouchDevice`) e lido pelos controllers. Deltas (`pointerDeltaX/Y`, `wheel`,
`pinchDelta`) acumulam entre quadros e são zerados por `consumeFrameDeltas()` no fim de cada tick.

## Properties

### keys

> **keys**: `Set`\<`string`\>

Defined in: [presentation/input/Input.ts:16](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/input/Input.ts#L16)

Conjunto de codes (KeyboardEvent.code) atualmente pressionadas.

***

### pinchDelta

> **pinchDelta**: `number`

Defined in: [presentation/input/Input.ts:30](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/input/Input.ts#L30)

Variação de pinch (distance delta entre 2 dedos) consumida por frame.

***

### pointerButtons

> **pointerButtons**: `number`

Defined in: [presentation/input/Input.ts:26](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/input/Input.ts#L26)

Bitmask de botões pressionados (1=left, 2=middle, 4=right — bit `1 << PointerEvent.button`).

***

### pointerDeltaX

> **pointerDeltaX**: `number`

Defined in: [presentation/input/Input.ts:22](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/input/Input.ts#L22)

Delta X acumulado desde o último consumeFrameDeltas.

***

### pointerDeltaY

> **pointerDeltaY**: `number`

Defined in: [presentation/input/Input.ts:24](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/input/Input.ts#L24)

Delta Y acumulado.

***

### pointerX

> **pointerX**: `number`

Defined in: [presentation/input/Input.ts:18](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/input/Input.ts#L18)

Posição X do pointer em coords de canvas (último move).

***

### pointerY

> **pointerY**: `number`

Defined in: [presentation/input/Input.ts:20](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/input/Input.ts#L20)

Posição Y do pointer em coords de canvas.

***

### wheel

> **wheel**: `number`

Defined in: [presentation/input/Input.ts:28](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/input/Input.ts#L28)

Wheel delta acumulado (positivo = rolar para baixo).
