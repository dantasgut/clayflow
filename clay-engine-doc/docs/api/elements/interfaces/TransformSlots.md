[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / TransformSlots

# Interface: TransformSlots

Defined in: [elements/scene/flows/TransformFlow.ts:41](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/scene/flows/TransformFlow.ts#L41)

Slots do estágio de transformação.

## Extends

- `SlotMap`

## Indexable

> \[`key`: `string`\]: `SlotDeclaration`

## Properties

### children

> `readonly` **children**: `EntitiesSlot`

Defined in: [elements/scene/flows/TransformFlow.ts:49](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/scene/flows/TransformFlow.ts#L49)

Entidades com `Transform` e `Parent` (a hierarquia opcional).

***

### entities

> `readonly` **entities**: `EntitiesSlot`

Defined in: [elements/scene/flows/TransformFlow.ts:47](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/scene/flows/TransformFlow.ts#L47)

Entidades com `Transform` (remoções recompõem).

***

### fnRecords

> `readonly` **fnRecords**: `PoolSlot`\<`true`\>

Defined in: [elements/scene/flows/TransformFlow.ts:53](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/scene/flows/TransformFlow.ts#L53)

Pool dos registros de parâmetros das `TransformFunction` (existe com alguma função na cena).

***

### functions

> `readonly` **functions**: `EntitiesSlot`

Defined in: [elements/scene/flows/TransformFlow.ts:51](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/scene/flows/TransformFlow.ts#L51)

Entidades com `Transform` e `TransformFunction` (spec 009).

***

### time

> `readonly` **time**: `SingletonSlot`\<`true`\>

Defined in: [elements/scene/flows/TransformFlow.ts:55](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/scene/flows/TransformFlow.ts#L55)

Relógio da cena (tempo simulado das funções; sem relógio, 0).

***

### transforms

> `readonly` **transforms**: `PoolSlot`\<`false`\>

Defined in: [elements/scene/flows/TransformFlow.ts:43](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/scene/flows/TransformFlow.ts#L43)

Pool das intenções `Transform` (entrada da composição).

***

### worlds

> `readonly` **worlds**: `PoolSlot`\<`false`\>

Defined in: [elements/scene/flows/TransformFlow.ts:45](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/scene/flows/TransformFlow.ts#L45)

Pool das matrizes de mundo `WorldTransform` (saída).
