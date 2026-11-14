[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / PoolSlot

# Interface: PoolSlot\<O\>

Defined in: [src/scene/flows/slots.ts:19](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L19)

Pool da C2 pela chave (`schema.name` ou `schema.name:algoritmo`).

## Type Parameters

### O

`O` *extends* `boolean` = `boolean`

## Properties

### kind

> `readonly` **kind**: `"pool"`

Defined in: [src/scene/flows/slots.ts:21](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L21)

Tipo do slot.

***

### optional

> `readonly` **optional**: `O`

Defined in: [src/scene/flows/slots.ts:25](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L25)

Opcional: o Flow fica pronto sem o pool (resolvido como `undefined`).

***

### poolKey

> `readonly` **poolKey**: `string`

Defined in: [src/scene/flows/slots.ts:23](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L23)

Chave do pool.
