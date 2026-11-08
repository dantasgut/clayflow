[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / WgslResourceOptions

# Interface: WgslResourceOptions

Defined in: [src/scene/shaders/WgslResource.ts:126](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslResource.ts#L126)

Opções de `wgslResource`.

## Extends

- [`WgslResourceDeclaration`](WgslResourceDeclaration.md)

## Properties

### binding

> `readonly` **binding**: [`WgslBindingKind`](../type-aliases/WgslBindingKind.md)

Defined in: [src/scene/shaders/WgslResource.ts:110](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslResource.ts#L110)

Ligação.

#### Inherited from

[`WgslResourceDeclaration`](WgslResourceDeclaration.md).[`binding`](WgslResourceDeclaration.md#binding)

***

### frequency

> `readonly` **frequency**: [`BindingFrequency`](../type-aliases/BindingFrequency.md)

Defined in: [src/scene/shaders/WgslResource.ts:114](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslResource.ts#L114)

Frequência (grupo).

#### Inherited from

[`WgslResourceDeclaration`](WgslResourceDeclaration.md).[`frequency`](WgslResourceDeclaration.md#frequency)

***

### name

> `readonly` **name**: `string`

Defined in: [src/scene/shaders/WgslResource.ts:128](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslResource.ts#L128)

Nome da variável WGSL (e do módulo).

***

### provider

> `readonly` **provider**: [`ResourceProvider`](../type-aliases/ResourceProvider.md)

Defined in: [src/scene/shaders/WgslResource.ts:116](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslResource.ts#L116)

Fornecedor.

#### Inherited from

[`WgslResourceDeclaration`](WgslResourceDeclaration.md).[`provider`](WgslResourceDeclaration.md#provider)

***

### type?

> `readonly` `optional` **type?**: [`WgslResourceType`](../type-aliases/WgslResourceType.md)

Defined in: [src/scene/shaders/WgslResource.ts:112](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslResource.ts#L112)

Tipo do dado (buffers).

#### Inherited from

[`WgslResourceDeclaration`](WgslResourceDeclaration.md).[`type`](WgslResourceDeclaration.md#type)
