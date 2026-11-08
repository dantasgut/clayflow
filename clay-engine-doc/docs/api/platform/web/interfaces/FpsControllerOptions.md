[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / FpsControllerOptions

# Interface: FpsControllerOptions

Defined in: [src/platform/web/input/FpsController.ts:8](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/input/FpsController.ts#L8)

Opções do FpsController.

## Properties

### canvas?

> `readonly` `optional` **canvas?**: `HTMLCanvasElement`

Defined in: [src/platform/web/input/FpsController.ts:16](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/input/FpsController.ts#L16)

Canvas para pedir pointer lock no clique (olhar sem segurar o botão).

***

### mouseSensitivity?

> `readonly` `optional` **mouseSensitivity?**: `number`

Defined in: [src/platform/web/input/FpsController.ts:14](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/input/FpsController.ts#L14)

Radianos por pixel. Default 0.003.

***

### position?

> `readonly` `optional` **position?**: readonly \[`number`, `number`, `number`\]

Defined in: [src/platform/web/input/FpsController.ts:10](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/input/FpsController.ts#L10)

Posição inicial (olhos). Default: a do `Transform` da câmera no primeiro quadro.

***

### speed?

> `readonly` `optional` **speed?**: `number`

Defined in: [src/platform/web/input/FpsController.ts:12](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/input/FpsController.ts#L12)

Unidades por segundo. Default 4.
