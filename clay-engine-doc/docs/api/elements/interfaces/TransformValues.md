[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / TransformValues

# Interface: TransformValues

Defined in: [elements/scene/Transform.ts:10](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/elements/scene/Transform.ts#L10)

Valores de construção de um `Transform` (todos opcionais).

## Properties

### position?

> `readonly` `optional` **position?**: readonly `number`[]

Defined in: [elements/scene/Transform.ts:12](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/elements/scene/Transform.ts#L12)

Posição no mundo `[x, y, z, 1]`. Default `[0, 0, 0, 1]`.

***

### rotation?

> `readonly` `optional` **rotation?**: readonly `number`[]

Defined in: [elements/scene/Transform.ts:14](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/elements/scene/Transform.ts#L14)

Rotação como quaternion `[x, y, z, w]`. Default identidade `[0, 0, 0, 1]`.

***

### scale?

> `readonly` `optional` **scale?**: readonly `number`[]

Defined in: [elements/scene/Transform.ts:16](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/elements/scene/Transform.ts#L16)

Escala por eixo `[sx, sy, sz, 1]`. Default `[1, 1, 1, 1]`; negativa espelha.
