[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / ArrayFieldSpec

# Interface: ArrayFieldSpec

Defined in: [src/scene/descriptors/StructSchema.ts:14](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/StructSchema.ts#L14)

Array de tamanho fixo `array<E, N>`.

## Properties

### element

> `readonly` **element**: [`FieldSpec`](../type-aliases/FieldSpec.md)

Defined in: [src/scene/descriptors/StructSchema.ts:18](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/StructSchema.ts#L18)

Tipo de cada elemento.

***

### kind

> `readonly` **kind**: `"array"`

Defined in: [src/scene/descriptors/StructSchema.ts:16](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/StructSchema.ts#L16)

Discriminador do campo composto.

***

### length

> `readonly` **length**: `number`

Defined in: [src/scene/descriptors/StructSchema.ts:20](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/StructSchema.ts#L20)

Número de elementos (≥ 1).
