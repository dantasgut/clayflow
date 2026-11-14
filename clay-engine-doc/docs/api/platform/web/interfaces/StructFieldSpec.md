[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / StructFieldSpec

# Interface: StructFieldSpec

Defined in: [src/scene/descriptors/StructSchema.ts:32](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/StructSchema.ts#L32)

Struct aninhado, pelo seu schema.

## Properties

### kind

> `readonly` **kind**: `"struct"`

Defined in: [src/scene/descriptors/StructSchema.ts:34](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/StructSchema.ts#L34)

Discriminador do campo composto.

***

### schema

> `readonly` **schema**: [`StructSchema`](../classes/StructSchema.md)

Defined in: [src/scene/descriptors/StructSchema.ts:36](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/StructSchema.ts#L36)

Schema do struct aninhado (entra nas dependências do schema que o contém).
