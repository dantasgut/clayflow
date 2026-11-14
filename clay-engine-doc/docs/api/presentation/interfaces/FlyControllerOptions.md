[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [presentation](../README.md) / FlyControllerOptions

# Interface: FlyControllerOptions

Defined in: [src/presentation/input/controllers/FlyController.ts:23](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/controllers/FlyController.ts#L23)

Opções do FlyController.

## Properties

### keymap?

> `readonly` `optional` **keymap?**: [`FlyControllerKeymap`](FlyControllerKeymap.md)

Defined in: [src/presentation/input/controllers/FlyController.ts:31](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/controllers/FlyController.ts#L31)

Teclas por direção.

***

### mouseSensitivity?

> `readonly` `optional` **mouseSensitivity?**: `number`

Defined in: [src/presentation/input/controllers/FlyController.ts:29](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/controllers/FlyController.ts#L29)

Radianos por pixel de arrasto. Default 0.003.

***

### position?

> `readonly` `optional` **position?**: readonly \[`number`, `number`, `number`\]

Defined in: [src/presentation/input/controllers/FlyController.ts:25](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/controllers/FlyController.ts#L25)

Posição inicial. Default: a do `Transform` da câmera no primeiro quadro.

***

### speed?

> `readonly` `optional` **speed?**: `number`

Defined in: [src/presentation/input/controllers/FlyController.ts:27](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/controllers/FlyController.ts#L27)

Unidades por segundo. Default 6.
