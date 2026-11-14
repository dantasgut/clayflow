[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / InferredEntry

# Interface: InferredEntry

Defined in: [src/scene/systems/LayoutInferencer.ts:66](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/LayoutInferencer.ts#L66)

Entrada de layout inferida para um binding usado pelas entradas pedidas.

## Properties

### binding

> `readonly` **binding**: `number`

Defined in: [src/scene/systems/LayoutInferencer.ts:68](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/LayoutInferencer.ts#L68)

Índice do `@binding`.

***

### declared

> `readonly` **declared**: [`WgslResource`](WgslResource.md)

Defined in: [src/scene/systems/LayoutInferencer.ts:78](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/LayoutInferencer.ts#L78)

Recurso declarado (spec 031).

***

### name

> `readonly` **name**: `string`

Defined in: [src/scene/systems/LayoutInferencer.ts:70](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/LayoutInferencer.ts#L70)

Nome da variável (mensagens; a fonte vem do recurso declarado, pela identidade).

***

### resource

> `readonly` **resource**: [`InferredResource`](../type-aliases/InferredResource.md)

Defined in: [src/scene/systems/LayoutInferencer.ts:76](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/LayoutInferencer.ts#L76)

Tipo de recurso do binding.

***

### typeName

> `readonly` **typeName**: `string`

Defined in: [src/scene/systems/LayoutInferencer.ts:72](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/LayoutInferencer.ts#L72)

Struct (ou elemento de `array<…>`) do binding.

***

### visibility

> `readonly` **visibility**: `number`

Defined in: [src/scene/systems/LayoutInferencer.ts:74](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/systems/LayoutInferencer.ts#L74)

Bitmask `GPUShaderStage` dos estágios das entradas pedidas que usam o binding.
