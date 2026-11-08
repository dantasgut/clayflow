[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / WgslModuleOptions

# Interface: WgslModuleOptions

Defined in: [src/scene/shaders/WgslModule.ts:24](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslModule.ts#L24)

Opções de `wgslModule`.

## Properties

### name

> `readonly` **name**: `string`

Defined in: [src/scene/shaders/WgslModule.ts:26](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslModule.ts#L26)

Nome do módulo (não vazio).

***

### requires?

> `readonly` `optional` **requires?**: readonly [`WgslModule`](WgslModule.md)[]

Defined in: [src/scene/shaders/WgslModule.ts:30](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslModule.ts#L30)

Dependências (default nenhuma).

***

### source

> `readonly` **source**: `string`

Defined in: [src/scene/shaders/WgslModule.ts:28](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslModule.ts#L28)

Fonte WGSL.

***

### structs?

> `readonly` `optional` **structs?**: readonly [`StructSchema`](../classes/StructSchema.md)[]

Defined in: [src/scene/shaders/WgslModule.ts:32](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslModule.ts#L32)

Schemas dos structs usados (default nenhum).
