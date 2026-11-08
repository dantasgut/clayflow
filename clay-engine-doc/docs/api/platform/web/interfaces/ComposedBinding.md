[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / ComposedBinding

# Interface: ComposedBinding

Defined in: [src/scene/shaders/composeWgsl.ts:18](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/composeWgsl.ts#L18)

Ligação atribuída pelo motor a um recurso declarado (spec 031).

## Properties

### binding

> `readonly` **binding**: `number`

Defined in: [src/scene/shaders/composeWgsl.ts:26](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/composeWgsl.ts#L26)

Ligação dentro do grupo (ordem do nome).

***

### frequency

> `readonly` **frequency**: [`BindingFrequency`](../type-aliases/BindingFrequency.md)

Defined in: [src/scene/shaders/composeWgsl.ts:28](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/composeWgsl.ts#L28)

Frequência do recurso.

***

### group

> `readonly` **group**: `number`

Defined in: [src/scene/shaders/composeWgsl.ts:24](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/composeWgsl.ts#L24)

Grupo (posto da frequência entre as presentes).

***

### name

> `readonly` **name**: `string`

Defined in: [src/scene/shaders/composeWgsl.ts:22](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/composeWgsl.ts#L22)

Nome da variável.

***

### resource

> `readonly` **resource**: [`WgslResource`](WgslResource.md)

Defined in: [src/scene/shaders/composeWgsl.ts:20](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/composeWgsl.ts#L20)

O recurso.
