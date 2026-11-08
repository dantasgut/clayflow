[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / VertexAttributeLayout

# Interface: VertexAttributeLayout

Defined in: [src/scene/descriptors/StructSchema.ts:80](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/StructSchema.ts#L80)

Atributo de vértice compacto: posição no vértice intercalado e formato WebGPU.

## Properties

### format

> `readonly` **format**: `GPUVertexFormat`

Defined in: [src/scene/descriptors/StructSchema.ts:86](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/StructSchema.ts#L86)

Formato do atributo no WebGPU (ex.: `'float32x3'`).

***

### name

> `readonly` **name**: `string`

Defined in: [src/scene/descriptors/StructSchema.ts:82](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/StructSchema.ts#L82)

Nome do campo no schema.

***

### offset

> `readonly` **offset**: `number`

Defined in: [src/scene/descriptors/StructSchema.ts:84](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/StructSchema.ts#L84)

Bytes desde o início do vértice.
