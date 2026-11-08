[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / TextureRef

# Interface: TextureRef

Defined in: [src/scene/flows/slots.ts:144](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L144)

Textura de um Resource: `schema` + `descId` do descritor de textura.

## Properties

### descId

> `readonly` **descId**: `string`

Defined in: [src/scene/flows/slots.ts:148](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L148)

Id do descritor de textura no Resource.

***

### schema

> `readonly` **schema**: [`Schema`](Schema.md)

Defined in: [src/scene/flows/slots.ts:146](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L146)

Schema do Resource dono da textura.

***

### select?

> `readonly` `optional` **select?**: (`resource`) => `boolean`

Defined in: [src/scene/flows/slots.ts:150](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L150)

Filtro do Resource (padrão: o primeiro com o schema).

#### Parameters

##### resource

[`Resource`](Resource.md)

#### Returns

`boolean`
