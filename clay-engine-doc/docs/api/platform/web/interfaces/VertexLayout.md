[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / VertexLayout

# Interface: VertexLayout

Defined in: [src/scene/descriptors/StructSchema.ts:90](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/StructSchema.ts#L90)

Layout de vértice intercalado sem alinhamento de struct (ex.: `vec3f` ocupa 12 bytes).

## Properties

### attributes

> `readonly` **attributes**: readonly [`VertexAttributeLayout`](VertexAttributeLayout.md)[]

Defined in: [src/scene/descriptors/StructSchema.ts:94](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/StructSchema.ts#L94)

Atributos na ordem declarada.

***

### stride

> `readonly` **stride**: `number`

Defined in: [src/scene/descriptors/StructSchema.ts:92](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/StructSchema.ts#L92)

Bytes por vértice (soma dos atributos).
