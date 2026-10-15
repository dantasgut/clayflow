[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / FpsControllerOptions

# Interface: FpsControllerOptions

Defined in: [presentation/input/controllers/FpsController.ts:8](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/input/controllers/FpsController.ts#L8)

Opções do FpsController.

## Properties

### canvas?

> `readonly` `optional` **canvas?**: `HTMLCanvasElement`

Defined in: [presentation/input/controllers/FpsController.ts:16](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/input/controllers/FpsController.ts#L16)

Canvas para pedir pointer lock no clique (olhar sem segurar o botão).

***

### mouseSensitivity?

> `readonly` `optional` **mouseSensitivity?**: `number`

Defined in: [presentation/input/controllers/FpsController.ts:14](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/input/controllers/FpsController.ts#L14)

Radianos por pixel. Default 0.003.

***

### position?

> `readonly` `optional` **position?**: readonly \[`number`, `number`, `number`\]

Defined in: [presentation/input/controllers/FpsController.ts:10](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/input/controllers/FpsController.ts#L10)

Posição inicial (olhos). Default: a do `Transform` da câmera no primeiro quadro.

***

### speed?

> `readonly` `optional` **speed?**: `number`

Defined in: [presentation/input/controllers/FpsController.ts:12](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/input/controllers/FpsController.ts#L12)

Unidades por segundo. Default 4.
