[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / ControllerContext

# Interface: ControllerContext

Defined in: [presentation/input/InputDrivenController.ts:7](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/input/InputDrivenController.ts#L7)

Contexto passado pelo InteractionSystem aos controllers em cada tick.
Contém `input` (state agregado) + `dt` (tempo desde último frame).

## Properties

### dt

> `readonly` **dt**: `number`

Defined in: [presentation/input/InputDrivenController.ts:11](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/input/InputDrivenController.ts#L11)

Delta time em segundos para integração frame-rate-independent.

***

### input

> `readonly` **input**: [`Input`](../classes/Input.md)

Defined in: [presentation/input/InputDrivenController.ts:9](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/input/InputDrivenController.ts#L9)

Input state shared (key state, pointer deltas, etc.).
