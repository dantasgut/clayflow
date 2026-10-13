[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / CameraSlots

# Interface: CameraSlots

Defined in: [elements/scene/flows/CameraFlow.ts:17](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/scene/flows/CameraFlow.ts#L17)

Slots do estágio de câmera.

## Extends

- `SlotMap`

## Indexable

> \[`key`: `string`\]: `SlotDeclaration`

## Properties

### cameras

> `readonly` **cameras**: `EntitiesSlot`

Defined in: [elements/scene/flows/CameraFlow.ts:27](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/scene/flows/CameraFlow.ts#L27)

Toda entidade com `Camera` (a falta do `Transform` é erro).

***

### matrices

> `readonly` **matrices**: `PoolSlot`\<`false`\>

Defined in: [elements/scene/flows/CameraFlow.ts:21](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/scene/flows/CameraFlow.ts#L21)

Pool das matrizes (`CameraMatrices`, saída).

***

### params

> `readonly` **params**: `PoolSlot`\<`false`\>

Defined in: [elements/scene/flows/CameraFlow.ts:19](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/scene/flows/CameraFlow.ts#L19)

Pool dos parâmetros (`Camera`): o estágio espera a primeira câmera.

***

### views

> `readonly` **views**: `EntitiesSlot`

Defined in: [elements/scene/flows/CameraFlow.ts:25](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/scene/flows/CameraFlow.ts#L25)

Câmeras com `Transform`: registro `CameraRecord` e a lista das vivas (grupo único).

***

### worlds

> `readonly` **worlds**: `PoolSlot`\<`false`\>

Defined in: [elements/scene/flows/CameraFlow.ts:23](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/scene/flows/CameraFlow.ts#L23)

Pool `WorldTransform` (matriz de mundo da câmera).
