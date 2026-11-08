[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / WgslResource

# Interface: WgslResource

Defined in: [src/scene/shaders/WgslResource.ts:120](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslResource.ts#L120)

Recurso de shader: um módulo WGSL sem fonte de função que declara uma variável ligada pelo motor.

## Extends

- [`WgslModule`](WgslModule.md)

## Properties

### name

> `readonly` **name**: `string`

Defined in: [src/scene/shaders/WgslModule.ts:12](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslModule.ts#L12)

Identifica o módulo nas mensagens; único dentro de um grafo de montagem.

#### Inherited from

[`WgslModule`](WgslModule.md).[`name`](WgslModule.md#name)

***

### requires

> `readonly` **requires**: readonly [`WgslModule`](WgslModule.md)[]

Defined in: [src/scene/shaders/WgslModule.ts:16](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslModule.ts#L16)

Dependências, na ordem em que entram no shader.

#### Inherited from

[`WgslModule`](WgslModule.md).[`requires`](WgslModule.md#requires)

***

### resource

> `readonly` **resource**: [`WgslResourceDeclaration`](WgslResourceDeclaration.md)

Defined in: [src/scene/shaders/WgslResource.ts:122](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslResource.ts#L122)

A declaração.

***

### source

> `readonly` **source**: `string`

Defined in: [src/scene/shaders/WgslModule.ts:14](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslModule.ts#L14)

Fonte WGSL; pode conter marcadores `{{struct:Nome}}` (uso explícito de um struct gerado).

#### Inherited from

[`WgslModule`](WgslModule.md).[`source`](WgslModule.md#source)

***

### structs

> `readonly` **structs**: readonly [`StructSchema`](../classes/StructSchema.md)[]

Defined in: [src/scene/shaders/WgslModule.ts:18](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslModule.ts#L18)

Schemas cujos structs o módulo usa (gerados uma vez por shader).

#### Inherited from

[`WgslModule`](WgslModule.md).[`structs`](WgslModule.md#structs)

***

### symbols

> `readonly` **symbols**: readonly [`WgslSymbol`](WgslSymbol.md)[]

Defined in: [src/scene/shaders/WgslModule.ts:20](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslModule.ts#L20)

Símbolos de nível superior definidos pelo fonte (derivado na criação).

#### Inherited from

[`WgslModule`](WgslModule.md).[`symbols`](WgslModule.md#symbols)
