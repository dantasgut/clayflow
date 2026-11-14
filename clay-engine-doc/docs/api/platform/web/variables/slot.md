[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / slot

# Variable: slot

> `const` **slot**: `object`

Defined in: [src/scene/flows/slots.ts:381](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L381)

Construtores de slots. Um slot é a declaração tipada de um dado que o Flow consome; a Camada 2 o resolve, o mantém
atualizado e o entrega ao `dispatch` (`bound.slots`). Slots obrigatórios não resolvidos mantêm o Flow pendente.

## Type Declaration

### bodies()

> `readonly` **bodies**(): [`BodiesSlot`](../interfaces/BodiesSlot.md)

O pool de corpos do `bodyType` da instância.

#### Returns

[`BodiesSlot`](../interfaces/BodiesSlot.md)

### channel()

> `readonly` **channel**\<`O`\>(`schema`, `descId`, `opts?`): `ChannelSlot`\<`O`\>

Canal temporal do descritor `descId` (com `history`) do primeiro Resource com `schema` (spec 037). Os bindings
das fatias declaram o provedor `{ slot: '<nome>', lag }`.

#### Type Parameters

##### O

`O` *extends* `boolean` = `false`

#### Parameters

##### schema

[`Schema`](../interfaces/Schema.md)

##### descId

`string`

##### opts?

###### optional?

`O`

###### select?

(`resource`) => `boolean`

#### Returns

`ChannelSlot`\<`O`\>

### entities()

> `readonly` **entities**\<`T`\>(`opts`): [`EntitiesSlot`](../interfaces/EntitiesSlot.md)\<`T`\>

Entidades com um Resource de cada tipo de `all` (ex.: geometria + material + transform); com `record`, a C2
mantém também um registro de GPU por entidade (ver `EntityRecordDeclaration`); com `groups`, os grupos de
instâncias (ver `EntityGroupsDeclaration`); com `owns`, a posse da GPU sobre descritores das entidades.

#### Type Parameters

##### T

`T` *extends* readonly [`ResourceType`](../type-aliases/ResourceType.md)\<[`Resource`](../interfaces/Resource.md)\>[]

#### Parameters

##### opts

###### all

`T`

###### groups?

[`EntityGroupsDeclaration`](../interfaces/EntityGroupsDeclaration.md)

###### owns?

readonly readonly \[[`ResourceType`](../type-aliases/ResourceType.md)\<[`Resource`](../interfaces/Resource.md)\>, `string`\][]

###### record?

[`EntityRecordDeclaration`](../interfaces/EntityRecordDeclaration.md)

#### Returns

[`EntitiesSlot`](../interfaces/EntitiesSlot.md)\<`T`\>

### pool()

> `readonly` **pool**\<`O`\>(`poolKey`, `opts?`): [`PoolSlot`](../interfaces/PoolSlot.md)\<`O`\>

Pool da C2 pela chave.

#### Type Parameters

##### O

`O` *extends* `boolean` = `false`

#### Parameters

##### poolKey

`string`

##### opts?

###### optional?

`O`

#### Returns

[`PoolSlot`](../interfaces/PoolSlot.md)\<`O`\>

### poolChannel()

> `readonly` **poolChannel**\<`O`\>(`poolKey`, `opts?`): `ChannelSlot`\<`O`\>

Canal temporal do pool `poolKey` (descritor em pool com `history`; spec 037).

#### Type Parameters

##### O

`O` *extends* `boolean` = `false`

#### Parameters

##### poolKey

`string`

##### opts?

###### optional?

`O`

#### Returns

`ChannelSlot`\<`O`\>

### pools()

> `readonly` **pools**(`poolKeys`): [`PoolsSlot`](../interfaces/PoolsSlot.md)

Conjunto de pools (ex.: colliders); pools ainda inexistentes resolvem como `undefined`.

#### Parameters

##### poolKeys

readonly `string`[]

#### Returns

[`PoolsSlot`](../interfaces/PoolsSlot.md)

### singleton()

> `readonly` **singleton**\<`O`\>(`schema`, `opts?`): [`SingletonSlot`](../interfaces/SingletonSlot.md)\<`O`\>

O primeiro Resource com `schema` na cena (ex.: câmera ativa, `Time`).

#### Type Parameters

##### O

`O` *extends* `boolean` = `false`

#### Parameters

##### schema

[`Schema`](../interfaces/Schema.md)

##### opts?

###### optional?

`O`

###### select?

(`resource`) => `boolean`

#### Returns

[`SingletonSlot`](../interfaces/SingletonSlot.md)\<`O`\>

### target()

> `readonly` **target**(`target`): [`TargetSlot`](../interfaces/TargetSlot.md)

Alvo de render: a cor no canvas do quadro (`'canvas'`) ou na textura de um Resource, com profundidade opcional
de um Resource (ex.: `{ color: 'canvas', depth: { schema: FrameTargets.schema, descId: 'depth' } }`).

#### Parameters

##### target

`"canvas"` \| \{ `color`: `"canvas"` \| [`TextureRef`](../interfaces/TextureRef.md) \| `"none"`; `depth?`: [`TextureRef`](../interfaces/TextureRef.md); `samples?`: [`TextureRef`](../interfaces/TextureRef.md); \}

#### Returns

[`TargetSlot`](../interfaces/TargetSlot.md)

### texture()

> `readonly` **texture**\<`O`\>(`schema`, `descId`, `opts?`): [`TextureSlot`](../interfaces/TextureSlot.md)\<`O`\>

Textura alocada para o descritor `descId` do primeiro Resource com `schema`.

#### Type Parameters

##### O

`O` *extends* `boolean` = `false`

#### Parameters

##### schema

[`Schema`](../interfaces/Schema.md)

##### descId

`string`

##### opts?

###### optional?

`O`

###### select?

(`resource`) => `boolean`

#### Returns

[`TextureSlot`](../interfaces/TextureSlot.md)\<`O`\>

### work()

> `readonly` **work**\<`R`\>(`create`): [`WorkSlot`](../interfaces/WorkSlot.md)\<`R`\>

O Resource de trabalho da instância (spec 039): `create` é chamada uma vez quando a C2 aloca o Flow; o Resource
entra no World com o Flow e sai com ele. Os descritores dele (regiões, capacidades por `reserve`, contadores
lidos por `read`) são o espaço de trabalho; o shader os lê com o fornecedor `{ slot: nome, descriptor }`.

#### Type Parameters

##### R

`R` *extends* [`Resource`](../interfaces/Resource.md)

#### Parameters

##### create

() => `R`

#### Returns

[`WorkSlot`](../interfaces/WorkSlot.md)\<`R`\>
