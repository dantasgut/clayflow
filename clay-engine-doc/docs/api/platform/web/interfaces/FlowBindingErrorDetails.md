[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / FlowBindingErrorDetails

# Interface: FlowBindingErrorDetails

Defined in: [src/scene/flows/FlowBindingError.ts:2](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowBindingError.ts#L2)

Detalhes de um erro de ligação: o binding do WGSL, o pipeline e o Flow.

## Properties

### binding?

> `readonly` `optional` **binding?**: `number`

Defined in: [src/scene/flows/FlowBindingError.ts:10](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowBindingError.ts#L10)

Índice do `@binding`.

***

### flow

> `readonly` **flow**: `string`

Defined in: [src/scene/flows/FlowBindingError.ts:4](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowBindingError.ts#L4)

`type` do Flow.

***

### group?

> `readonly` `optional` **group?**: `number`

Defined in: [src/scene/flows/FlowBindingError.ts:8](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowBindingError.ts#L8)

Índice do `@group`.

***

### pipeline

> `readonly` **pipeline**: `string`

Defined in: [src/scene/flows/FlowBindingError.ts:6](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowBindingError.ts#L6)

Id do pipeline.

***

### variable?

> `readonly` `optional` **variable?**: `string`

Defined in: [src/scene/flows/FlowBindingError.ts:12](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowBindingError.ts#L12)

Nome da variável no WGSL.
