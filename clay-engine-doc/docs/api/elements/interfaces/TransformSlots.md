[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / TransformSlots

# Interface: TransformSlots

Defined in: [elements/scene/flows/TransformFlow.ts:34](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/scene/flows/TransformFlow.ts#L34)

Slots do estágio de transformação.

## Extends

- `SlotMap`

## Indexable

> \[`key`: `string`\]: `SlotDeclaration`

## Properties

### children

> `readonly` **children**: `EntitiesSlot`

Defined in: [elements/scene/flows/TransformFlow.ts:42](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/scene/flows/TransformFlow.ts#L42)

Entidades com `Transform` e `Parent` (a hierarquia opcional).

***

### entities

> `readonly` **entities**: `EntitiesSlot`

Defined in: [elements/scene/flows/TransformFlow.ts:40](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/scene/flows/TransformFlow.ts#L40)

Entidades com `Transform` (remoções recompõem).

***

### transforms

> `readonly` **transforms**: `PoolSlot`\<`false`\>

Defined in: [elements/scene/flows/TransformFlow.ts:36](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/scene/flows/TransformFlow.ts#L36)

Pool das intenções `Transform` (entrada da composição).

***

### worlds

> `readonly` **worlds**: `PoolSlot`\<`false`\>

Defined in: [elements/scene/flows/TransformFlow.ts:38](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/scene/flows/TransformFlow.ts#L38)

Pool das matrizes de mundo `WorldTransform` (saída).
