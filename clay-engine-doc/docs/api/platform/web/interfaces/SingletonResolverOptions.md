[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / SingletonResolverOptions

# Interface: SingletonResolverOptions

Defined in: [src/scene/consumers/strategies/SingletonResolver.ts:9](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/consumers/strategies/SingletonResolver.ts#L9)

Opções de `SingletonResolver`.

## Properties

### name?

> `readonly` `optional` **name?**: `string`

Defined in: [src/scene/consumers/strategies/SingletonResolver.ts:11](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/consumers/strategies/SingletonResolver.ts#L11)

Nome do resolver (fornecedor `{ consumer }` de um recurso). Default: `schema.name`.

***

### select?

> `readonly` `optional` **select?**: (`resource`) => `boolean`

Defined in: [src/scene/consumers/strategies/SingletonResolver.ts:13](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/consumers/strategies/SingletonResolver.ts#L13)

Filtro do recurso (ex.: só luzes que projetam sombra). Default: o primeiro com o schema.

#### Parameters

##### resource

[`Resource`](Resource.md)

#### Returns

`boolean`
