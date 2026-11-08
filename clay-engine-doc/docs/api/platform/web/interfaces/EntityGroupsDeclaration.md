[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / EntityGroupsDeclaration

# Interface: EntityGroupsDeclaration

Defined in: [src/scene/flows/slots.ts:84](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L84)

Grupos de instâncias de um conjunto `entities` (spec 007): a C2 agrupa as entradas pela chave que o estágio dá (ex.:
geometria + pipeline) e mantém na GPU a lista de instâncias de cada grupo — um segmento contíguo de um pool com chave
`schema.name`, um `u32` por instância. O estágio desenha um grupo com uma chamada (`first`, `count`) e o shader acha a
entidade por `lista[instance_index]`. A composição muda só por eventos (inserção, remoção, envio de um Resource da
entidade); com a cena parada nada é percorrido.

## Properties

### instance

> `readonly` **instance**: readonly \[[`ResourceType`](../type-aliases/ResourceType.md)\<[`Resource`](Resource.md)\>, `string`\] \| `"record"`

Defined in: [src/scene/flows/slots.ts:90](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L90)

Valor por instância: o slot do registro do conjunto (`'record'`) ou o slot de pool do descritor nomeado.

***

### key

> `readonly` **key**: (`entry`) => `string`

Defined in: [src/scene/flows/slots.ts:88](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L88)

Chave do grupo da entrada. Reavaliada na inserção e quando um Resource da entidade é enviado.

#### Parameters

##### entry

[`EntityEntry`](EntityEntry.md)

#### Returns

`string`

***

### rekeyOn?

> `readonly` `optional` **rekeyOn?**: `Readonly`\<`Record`\<`string`, readonly `string`[]\>\>

Defined in: [src/scene/flows/slots.ts:95](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L95)

Campos que podem mudar a chave, por schema do pool (ex.: `{ Transform: ['scale'] }`): o envio de um pool listado
só reavalia as chaves quando um desses campos mudou. Pools fora do mapa reavaliam a cada envio.

***

### schema

> `readonly` **schema**: [`StructSchema`](../classes/StructSchema.md)

Defined in: [src/scene/flows/slots.ts:86](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L86)

Schema da lista de instâncias (um único campo `u32`); o nome é a chave do pool lido pelo shader.
