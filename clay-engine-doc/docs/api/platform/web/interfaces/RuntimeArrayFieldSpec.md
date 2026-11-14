[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / RuntimeArrayFieldSpec

# Interface: RuntimeArrayFieldSpec

Defined in: [src/scene/descriptors/StructSchema.ts:24](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/StructSchema.ts#L24)

Array de tamanho definido em execução `array<E>` — só como último campo e só em storage.

## Properties

### element

> `readonly` **element**: [`FieldSpec`](../type-aliases/FieldSpec.md)

Defined in: [src/scene/descriptors/StructSchema.ts:28](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/StructSchema.ts#L28)

Tipo de cada elemento.

***

### kind

> `readonly` **kind**: `"runtimeArray"`

Defined in: [src/scene/descriptors/StructSchema.ts:26](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/StructSchema.ts#L26)

Discriminador do campo composto.
