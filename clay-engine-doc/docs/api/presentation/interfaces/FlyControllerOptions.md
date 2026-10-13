[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / FlyControllerOptions

# Interface: FlyControllerOptions

Defined in: [presentation/input/controllers/FlyController.ts:23](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/input/controllers/FlyController.ts#L23)

Opções do FlyController.

## Properties

### keymap?

> `readonly` `optional` **keymap?**: [`FlyControllerKeymap`](FlyControllerKeymap.md)

Defined in: [presentation/input/controllers/FlyController.ts:31](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/input/controllers/FlyController.ts#L31)

Teclas por direção.

***

### mouseSensitivity?

> `readonly` `optional` **mouseSensitivity?**: `number`

Defined in: [presentation/input/controllers/FlyController.ts:29](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/input/controllers/FlyController.ts#L29)

Radianos por pixel de arrasto. Default 0.003.

***

### position?

> `readonly` `optional` **position?**: readonly \[`number`, `number`, `number`\]

Defined in: [presentation/input/controllers/FlyController.ts:25](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/input/controllers/FlyController.ts#L25)

Posição inicial. Default: a do `Transform` da câmera no primeiro quadro.

***

### speed?

> `readonly` `optional` **speed?**: `number`

Defined in: [presentation/input/controllers/FlyController.ts:27](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/input/controllers/FlyController.ts#L27)

Unidades por segundo. Default 6.
