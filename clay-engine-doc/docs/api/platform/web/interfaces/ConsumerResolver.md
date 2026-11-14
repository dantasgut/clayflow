[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / ConsumerResolver

# Interface: ConsumerResolver

Defined in: [src/scene/consumers/ConsumerResolver.ts:17](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/consumers/ConsumerResolver.ts#L17)

Estratégia que fornece a fonte de um recurso declarado com fornecedor `{ pool: name }` ou `{ consumer: name }` (spec
031). `name` é o nome do fornecedor (nome do schema ou chave do pool); `typeName`, o struct WGSL que a fonte preenche.

## Properties

### name

> `readonly` **name**: `string`

Defined in: [src/scene/consumers/ConsumerResolver.ts:19](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/consumers/ConsumerResolver.ts#L19)

Nome do fornecedor (nome do schema ou chave do pool).

***

### typeName

> `readonly` **typeName**: `string`

Defined in: [src/scene/consumers/ConsumerResolver.ts:21](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/consumers/ConsumerResolver.ts#L21)

Struct WGSL que a fonte preenche (tipo do binding, ou do elemento de `array<…>`).

## Methods

### resolve()

> **resolve**(`ctx`): [`ResolvedSource`](../type-aliases/ResolvedSource.md) \| `undefined`

Defined in: [src/scene/consumers/ConsumerResolver.ts:23](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/consumers/ConsumerResolver.ts#L23)

Fonte atual, ou `undefined` se o dado ainda não existe na cena.

#### Parameters

##### ctx

[`ResolveContext`](ResolveContext.md)

#### Returns

[`ResolvedSource`](../type-aliases/ResolvedSource.md) \| `undefined`
