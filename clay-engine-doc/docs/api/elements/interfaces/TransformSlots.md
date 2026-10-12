[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / TransformSlots

# Interface: TransformSlots

Defined in: [elements/scene/flows/TransformFlow.ts:15](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/scene/flows/TransformFlow.ts#L15)

Slots do estágio de transformação.

## Extends

- `SlotMap`

## Indexable

> \[`key`: `string`\]: `SlotDeclaration`

## Properties

### entities

> `readonly` **entities**: `EntitiesSlot`

Defined in: [elements/scene/flows/TransformFlow.ts:21](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/scene/flows/TransformFlow.ts#L21)

Entidades com `Transform` (remoções recompõem).

***

### transforms

> `readonly` **transforms**: `PoolSlot`\<`false`\>

Defined in: [elements/scene/flows/TransformFlow.ts:17](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/scene/flows/TransformFlow.ts#L17)

Pool das intenções `Transform` (entrada da composição).

***

### worlds

> `readonly` **worlds**: `PoolSlot`\<`false`\>

Defined in: [elements/scene/flows/TransformFlow.ts:19](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/elements/scene/flows/TransformFlow.ts#L19)

Pool das matrizes de mundo `WorldTransform` (saída).
