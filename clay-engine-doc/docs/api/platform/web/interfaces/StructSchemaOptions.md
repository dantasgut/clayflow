[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / StructSchemaOptions

# Interface: StructSchemaOptions

Defined in: [src/scene/descriptors/StructSchema.ts:64](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/StructSchema.ts#L64)

Opções do `StructSchema`.

## Properties

### addressSpace?

> `readonly` `optional` **addressSpace?**: [`AddressSpace`](../type-aliases/AddressSpace.md)

Defined in: [src/scene/descriptors/StructSchema.ts:68](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/StructSchema.ts#L68)

Regras de layout (default `storage`; `uniform` arredonda alinhamentos de arrays e structs aninhados a 16).

***

### wgslName?

> `readonly` `optional` **wgslName?**: `string`

Defined in: [src/scene/descriptors/StructSchema.ts:66](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/StructSchema.ts#L66)

Nome do struct no WGSL (default: `name`, que continua sendo o pool key).
