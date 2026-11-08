[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / WgslModule

# Interface: WgslModule

Defined in: [src/scene/shaders/WgslModule.ts:10](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslModule.ts#L10)

Módulo WGSL: unidade de código de GPU com nome, fonte, dependências (por referência a outros módulos) e os schemas
cujos structs usa. Imutável. A montagem (`composeWgsl`) resolve as dependências em ordem topológica, inclui cada
módulo uma vez, gera os structs dos schemas e rejeita ciclos, nomes repetidos e símbolos em conflito.

## Extended by

- [`WgslResource`](WgslResource.md)
- [`ArenaReader`](ArenaReader.md)

## Properties

### name

> `readonly` **name**: `string`

Defined in: [src/scene/shaders/WgslModule.ts:12](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslModule.ts#L12)

Identifica o módulo nas mensagens; único dentro de um grafo de montagem.

***

### requires

> `readonly` **requires**: readonly `WgslModule`[]

Defined in: [src/scene/shaders/WgslModule.ts:16](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslModule.ts#L16)

Dependências, na ordem em que entram no shader.

***

### source

> `readonly` **source**: `string`

Defined in: [src/scene/shaders/WgslModule.ts:14](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslModule.ts#L14)

Fonte WGSL; pode conter marcadores `{{struct:Nome}}` (uso explícito de um struct gerado).

***

### structs

> `readonly` **structs**: readonly [`StructSchema`](../classes/StructSchema.md)[]

Defined in: [src/scene/shaders/WgslModule.ts:18](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslModule.ts#L18)

Schemas cujos structs o módulo usa (gerados uma vez por shader).

***

### symbols

> `readonly` **symbols**: readonly [`WgslSymbol`](WgslSymbol.md)[]

Defined in: [src/scene/shaders/WgslModule.ts:20](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslModule.ts#L20)

Símbolos de nível superior definidos pelo fonte (derivado na criação).
