[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / TextureSlot

# Interface: TextureSlot\<O\>

Defined in: [src/scene/flows/slots.ts:130](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L130)

Textura (e view) alocada pela C2 para o descritor `descId` do primeiro Resource com `schema`.

## Type Parameters

### O

`O` *extends* `boolean` = `boolean`

## Properties

### descId

> `readonly` **descId**: `string`

Defined in: [src/scene/flows/slots.ts:136](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L136)

Id do descritor de textura no Resource.

***

### kind

> `readonly` **kind**: `"texture"`

Defined in: [src/scene/flows/slots.ts:132](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L132)

Tipo do slot.

***

### optional

> `readonly` **optional**: `O`

Defined in: [src/scene/flows/slots.ts:138](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L138)

Opcional: o Flow fica pronto sem a textura (resolvida como `undefined`).

***

### schema

> `readonly` **schema**: [`Schema`](Schema.md)

Defined in: [src/scene/flows/slots.ts:134](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L134)

Schema do Resource dono da textura.

***

### select?

> `readonly` `optional` **select?**: (`resource`) => `boolean`

Defined in: [src/scene/flows/slots.ts:140](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L140)

Filtro do Resource (padrão: o primeiro com o schema).

#### Parameters

##### resource

[`Resource`](Resource.md)

#### Returns

`boolean`
