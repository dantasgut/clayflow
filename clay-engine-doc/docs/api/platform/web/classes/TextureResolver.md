[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / TextureResolver

# Class: TextureResolver

Defined in: [src/scene/consumers/strategies/TextureResolver.ts:13](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/consumers/strategies/TextureResolver.ts#L13)

Fonte de uma textura (view) alocada pela C2 para o descritor `descId` do primeiro recurso com `schema` (ex.: a
profundidade do `ShadowMap`, a cor da cena em `FrameTargets`). `typeName` é o tipo WGSL do binding
(ex.: `texture_depth_2d`); `name` é o nome do fornecedor (`{ consumer }`).

## Implements

- [`ConsumerResolver`](../interfaces/ConsumerResolver.md)

## Constructors

### Constructor

> **new TextureResolver**(`name`, `typeName`, `schema`, `descId`, `select?`): `TextureResolver`

Defined in: [src/scene/consumers/strategies/TextureResolver.ts:21](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/consumers/strategies/TextureResolver.ts#L21)

#### Parameters

##### name

`string`

Nome do fornecedor (`{ consumer }`).

##### typeName

`string`

Tipo WGSL do binding (ex.: `texture_depth_2d`).

##### schema

[`Schema`](../interfaces/Schema.md)

Schema do Resource dono da textura.

##### descId

`string`

Id do descritor de textura no Resource.

##### select?

(`resource`) => `boolean`

Filtro do Resource (padrão: o primeiro com o schema).

#### Returns

`TextureResolver`

## Properties

### name

> `readonly` **name**: `string`

Defined in: [src/scene/consumers/strategies/TextureResolver.ts:23](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/consumers/strategies/TextureResolver.ts#L23)

Nome do fornecedor (`{ consumer }`).

#### Implementation of

[`ConsumerResolver`](../interfaces/ConsumerResolver.md).[`name`](../interfaces/ConsumerResolver.md#name)

***

### typeName

> `readonly` **typeName**: `string`

Defined in: [src/scene/consumers/strategies/TextureResolver.ts:25](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/consumers/strategies/TextureResolver.ts#L25)

Tipo WGSL do binding (ex.: `texture_depth_2d`).

#### Implementation of

[`ConsumerResolver`](../interfaces/ConsumerResolver.md).[`typeName`](../interfaces/ConsumerResolver.md#typename)

## Methods

### resolve()

> **resolve**(`ctx`): [`ResolvedSource`](../type-aliases/ResolvedSource.md) \| `undefined`

Defined in: [src/scene/consumers/strategies/TextureResolver.ts:31](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/consumers/strategies/TextureResolver.ts#L31)

Fonte atual, ou `undefined` se o dado ainda não existe na cena.

#### Parameters

##### ctx

[`ResolveContext`](../interfaces/ResolveContext.md)

#### Returns

[`ResolvedSource`](../type-aliases/ResolvedSource.md) \| `undefined`

#### Implementation of

[`ConsumerResolver`](../interfaces/ConsumerResolver.md).[`resolve`](../interfaces/ConsumerResolver.md#resolve)
