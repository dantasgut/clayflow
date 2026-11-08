[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / ConsumerResolverRegistry

# Class: ConsumerResolverRegistry

Defined in: [src/scene/consumers/ConsumerResolverRegistry.ts:14](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/consumers/ConsumerResolverRegistry.ts#L14)

Registro dos resolvers de uma cena (fornecedores `{ pool }`/`{ consumer }` dos recursos declarados). Um resolver por nome; `register` de um nome existente substitui
(aplicações podem trocar o padrão), `registerDefault` não substitui (usado pela C2 ao criar pools).

## Constructors

### Constructor

> **new ConsumerResolverRegistry**(): `ConsumerResolverRegistry`

#### Returns

`ConsumerResolverRegistry`

## Methods

### get()

> **get**(`name`): [`ConsumerResolver`](../interfaces/ConsumerResolver.md) \| `undefined`

Defined in: [src/scene/consumers/ConsumerResolverRegistry.ts:35](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/consumers/ConsumerResolverRegistry.ts#L35)

Resolver do nome, ou `undefined`.

#### Parameters

##### name

`string`

#### Returns

[`ConsumerResolver`](../interfaces/ConsumerResolver.md) \| `undefined`

***

### has()

> **has**(`name`): `boolean`

Defined in: [src/scene/consumers/ConsumerResolverRegistry.ts:30](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/consumers/ConsumerResolverRegistry.ts#L30)

Há resolver para o nome?

#### Parameters

##### name

`string`

#### Returns

`boolean`

***

### names()

> **names**(): readonly `string`[]

Defined in: [src/scene/consumers/ConsumerResolverRegistry.ts:40](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/consumers/ConsumerResolverRegistry.ts#L40)

Nomes registrados, em ordem de registro (mensagens de erro).

#### Returns

readonly `string`[]

***

### register()

> **register**(`resolver`): `void`

Defined in: [src/scene/consumers/ConsumerResolverRegistry.ts:18](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/consumers/ConsumerResolverRegistry.ts#L18)

Registra (ou substitui) o resolver de `resolver.name`.

#### Parameters

##### resolver

[`ConsumerResolver`](../interfaces/ConsumerResolver.md)

#### Returns

`void`

***

### registerDefault()

> **registerDefault**(`resolver`): `boolean`

Defined in: [src/scene/consumers/ConsumerResolverRegistry.ts:23](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/consumers/ConsumerResolverRegistry.ts#L23)

Registra só se ainda não há resolver com o nome; devolve se registrou.

#### Parameters

##### resolver

[`ConsumerResolver`](../interfaces/ConsumerResolver.md)

#### Returns

`boolean`

***

### resolve()

> **resolve**(`name`, `ctx`): [`ResolvedSource`](../type-aliases/ResolvedSource.md) \| `undefined`

Defined in: [src/scene/consumers/ConsumerResolverRegistry.ts:48](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/consumers/ConsumerResolverRegistry.ts#L48)

Fonte atual do nome.

#### Parameters

##### name

`string`

##### ctx

[`ResolveContext`](../interfaces/ResolveContext.md)

#### Returns

[`ResolvedSource`](../type-aliases/ResolvedSource.md) \| `undefined`

#### Throws

ConsumerResolutionError se o nome não tem resolver (a mensagem lista os disponíveis).
