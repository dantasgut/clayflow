[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / PoolResolver

# Class: PoolResolver

Defined in: [src/scene/consumers/strategies/PoolResolver.ts:9](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/consumers/strategies/PoolResolver.ts#L9)

Fonte de um pool da C2 pela chave (`schema.name` ou `schema.name:algoritmo`): o buffer inteiro (`array<T>` no
shader). Registrado automaticamente pelo `ResourceSystem` ao criar o pool.

## Implements

- [`ConsumerResolver`](../interfaces/ConsumerResolver.md)

## Constructors

### Constructor

> **new PoolResolver**(`name`, `schema`): `PoolResolver`

Defined in: [src/scene/consumers/strategies/PoolResolver.ts:17](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/consumers/strategies/PoolResolver.ts#L17)

#### Parameters

##### name

`string`

Chave do pool (fornecedor `{ pool }`).

##### schema

[`Schema`](../interfaces/Schema.md)

Schema do elemento do pool.

#### Returns

`PoolResolver`

## Properties

### name

> `readonly` **name**: `string`

Defined in: [src/scene/consumers/strategies/PoolResolver.ts:19](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/consumers/strategies/PoolResolver.ts#L19)

Chave do pool (fornecedor `{ pool }`).

#### Implementation of

[`ConsumerResolver`](../interfaces/ConsumerResolver.md).[`name`](../interfaces/ConsumerResolver.md#name)

***

### typeName

> `readonly` **typeName**: `string`

Defined in: [src/scene/consumers/strategies/PoolResolver.ts:11](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/consumers/strategies/PoolResolver.ts#L11)

Struct WGSL do elemento do pool (`schema.wgslName`).

#### Implementation of

[`ConsumerResolver`](../interfaces/ConsumerResolver.md).[`typeName`](../interfaces/ConsumerResolver.md#typename)

## Methods

### resolve()

> **resolve**(`ctx`): [`ResolvedSource`](../type-aliases/ResolvedSource.md) \| `undefined`

Defined in: [src/scene/consumers/strategies/PoolResolver.ts:25](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/consumers/strategies/PoolResolver.ts#L25)

Fonte atual, ou `undefined` se o dado ainda não existe na cena.

#### Parameters

##### ctx

[`ResolveContext`](../interfaces/ResolveContext.md)

#### Returns

[`ResolvedSource`](../type-aliases/ResolvedSource.md) \| `undefined`

#### Implementation of

[`ConsumerResolver`](../interfaces/ConsumerResolver.md).[`resolve`](../interfaces/ConsumerResolver.md#resolve)
