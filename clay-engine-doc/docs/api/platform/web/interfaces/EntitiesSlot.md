[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / EntitiesSlot

# Interface: EntitiesSlot\<T\>

Defined in: [src/scene/flows/slots.ts:111](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L111)

Entidades que têm um Resource de cada tipo de `all`, mantidas pela C2 na inserção e na remoção.

## Type Parameters

### T

`T` *extends* readonly [`ResourceType`](../type-aliases/ResourceType.md)[] = readonly [`ResourceType`](../type-aliases/ResourceType.md)[]

## Properties

### all

> `readonly` **all**: `T`

Defined in: [src/scene/flows/slots.ts:115](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L115)

Classes de Resource que a entidade precisa ter (todas).

***

### groups?

> `readonly` `optional` **groups?**: [`EntityGroupsDeclaration`](EntityGroupsDeclaration.md)

Defined in: [src/scene/flows/slots.ts:119](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L119)

Grupos de instâncias, mantidos pela C2 (opcional).

***

### kind

> `readonly` **kind**: `"entities"`

Defined in: [src/scene/flows/slots.ts:113](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L113)

Tipo do slot.

***

### owns?

> `readonly` `optional` **owns?**: readonly readonly \[[`ResourceType`](../type-aliases/ResourceType.md)\<[`Resource`](Resource.md)\>, `string`\][]

Defined in: [src/scene/flows/slots.ts:126](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L126)

Descritores cujo dado passa a ser da GPU para as entidades do conjunto. Em pool (spec 007): depois do primeiro
envio a CPU não os envia mais e mutação em `data` é ignorada com aviso — ex.: a física escreve a pose no
`Transform` dos corpos. Individual (spec 008): o conjunto é o escritor declarado de um dado `upload: 'never'`
(ex.: os vértices de uma geometria escrita por um kernel; `hasGpuWriter`).

***

### record?

> `readonly` `optional` **record?**: [`EntityRecordDeclaration`](EntityRecordDeclaration.md)

Defined in: [src/scene/flows/slots.ts:117](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L117)

Registro de GPU por entidade, mantido pela C2 (opcional).
