[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / CameraValues

# Interface: CameraValues

Defined in: [elements/scene/Camera.ts:16](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/scene/Camera.ts#L16)

Valores de construção de uma `Camera` (todos opcionais).

## Properties

### aspect?

> `readonly` `optional` **aspect?**: `number`

Defined in: [elements/scene/Camera.ts:28](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/scene/Camera.ts#L28)

Razão de aspecto usada com `aspectMode: 'fixed'`. Default 16/9.

***

### aspectMode?

> `readonly` `optional` **aspectMode?**: `CameraAspectMode`

Defined in: [elements/scene/Camera.ts:30](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/scene/Camera.ts#L30)

Origem da razão de aspecto. Default `'canvas'`.

***

### far?

> `readonly` `optional` **far?**: `number`

Defined in: [elements/scene/Camera.ts:26](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/scene/Camera.ts#L26)

Plano distante. Default 1000.

***

### fov?

> `readonly` `optional` **fov?**: `number`

Defined in: [elements/scene/Camera.ts:20](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/scene/Camera.ts#L20)

Campo de visão vertical em radianos (perspectiva). Default `π/4`.

***

### near?

> `readonly` `optional` **near?**: `number`

Defined in: [elements/scene/Camera.ts:24](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/scene/Camera.ts#L24)

Plano próximo. Default 0,1.

***

### orthoHeight?

> `readonly` `optional` **orthoHeight?**: `number`

Defined in: [elements/scene/Camera.ts:22](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/scene/Camera.ts#L22)

Altura visível em unidades de mundo (ortográfica). Default 10.

***

### projection?

> `readonly` `optional` **projection?**: `CameraProjection`

Defined in: [elements/scene/Camera.ts:18](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/scene/Camera.ts#L18)

Projeção. Default `'perspective'`.
