[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / SingletonSlot

# Interface: SingletonSlot\<O\>

Defined in: [src/scene/flows/slots.ts:43](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L43)

O primeiro Resource com `schema` que continua na cena (e passa em `select`).

## Type Parameters

### O

`O` *extends* `boolean` = `boolean`

## Properties

### kind

> `readonly` **kind**: `"singleton"`

Defined in: [src/scene/flows/slots.ts:45](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L45)

Tipo do slot.

***

### optional

> `readonly` **optional**: `O`

Defined in: [src/scene/flows/slots.ts:49](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L49)

Opcional: o Flow fica pronto sem o Resource (resolvido como `undefined`).

***

### schema

> `readonly` **schema**: [`Schema`](Schema.md)

Defined in: [src/scene/flows/slots.ts:47](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L47)

Schema do Resource.

***

### select?

> `readonly` `optional` **select?**: (`resource`) => `boolean`

Defined in: [src/scene/flows/slots.ts:51](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L51)

Filtro do Resource (padrão: o primeiro com o schema).

#### Parameters

##### resource

[`Resource`](Resource.md)

#### Returns

`boolean`
