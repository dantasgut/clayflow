[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / SingletonResolver

# Class: SingletonResolver

Defined in: [src/scene/consumers/strategies/SingletonResolver.ts:20](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/consumers/strategies/SingletonResolver.ts#L20)

Fonte de um Resource único da cena: o descritor `descId` do **primeiro recurso inserido que continua na cena** com
`schema` (ex.: a câmera ativa, o `Time`, o `ParticlePhysics`). Trocar o recurso (remover o primeiro) muda a fonte.

## Implements

- [`ConsumerResolver`](../interfaces/ConsumerResolver.md)

## Constructors

### Constructor

> **new SingletonResolver**(`schema`, `descId`, `options?`): `SingletonResolver`

Defined in: [src/scene/consumers/strategies/SingletonResolver.ts:26](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/consumers/strategies/SingletonResolver.ts#L26)

#### Parameters

##### schema

[`Schema`](../interfaces/Schema.md)

##### descId

`string`

##### options?

[`SingletonResolverOptions`](../interfaces/SingletonResolverOptions.md) = `{}`

#### Returns

`SingletonResolver`

## Properties

### name

> `readonly` **name**: `string`

Defined in: [src/scene/consumers/strategies/SingletonResolver.ts:22](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/consumers/strategies/SingletonResolver.ts#L22)

Nome do resolver (`options.name`, ou `schema.name`).

#### Implementation of

[`ConsumerResolver`](../interfaces/ConsumerResolver.md).[`name`](../interfaces/ConsumerResolver.md#name)

***

### typeName

> `readonly` **typeName**: `string`

Defined in: [src/scene/consumers/strategies/SingletonResolver.ts:24](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/consumers/strategies/SingletonResolver.ts#L24)

Struct WGSL do Resource (`schema.wgslName`).

#### Implementation of

[`ConsumerResolver`](../interfaces/ConsumerResolver.md).[`typeName`](../interfaces/ConsumerResolver.md#typename)

## Methods

### resolve()

> **resolve**(`ctx`): [`ResolvedSource`](../type-aliases/ResolvedSource.md) \| `undefined`

Defined in: [src/scene/consumers/strategies/SingletonResolver.ts:35](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/consumers/strategies/SingletonResolver.ts#L35)

Fonte atual, ou `undefined` se o dado ainda não existe na cena.

#### Parameters

##### ctx

[`ResolveContext`](../interfaces/ResolveContext.md)

#### Returns

[`ResolvedSource`](../type-aliases/ResolvedSource.md) \| `undefined`

#### Implementation of

[`ConsumerResolver`](../interfaces/ConsumerResolver.md).[`resolve`](../interfaces/ConsumerResolver.md#resolve)
