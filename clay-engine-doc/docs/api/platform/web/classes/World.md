[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / World

# Class: World

Defined in: [src/scene/world/World.ts:55](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/world/World.ts#L55)

World é o ECS-like da Camada 2 — registra Entities e indexa seus
Resources por schema/tag. Operações principais:
  - `insert(entity)`: traverse + atribui EntityId + indexa.
  - `query*`: lookup eficiente por schema/tag.
  - `remove(entity)`: limpa indexes + emite eventos.

Atomicidade: insert/remove emitem `resourcesChanged` e `entitiesRemoved`
no EventBus para sistemas reativos (ResourceSystem aloca buffers).

## Constructors

### Constructor

> **new World**(`events`): `World`

Defined in: [src/scene/world/World.ts:62](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/world/World.ts#L62)

#### Parameters

##### events

[`EventBus`](../interfaces/EventBus.md)

#### Returns

`World`

## Methods

### addTag()

> **addTag**(`id`, `tag`): `void`

Defined in: [src/scene/world/World.ts:242](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/world/World.ts#L242)

Tags são labels arbitrários associados a entityIds. Útil para queries
por gameplay context (e.g. "enemy", "interactive", "bloom-only").

#### Parameters

##### id

[`EntityId`](../type-aliases/EntityId.md)

##### tag

`string`

#### Returns

`void`

***

### allRecords()

> **allRecords**(): `IterableIterator`\<`EntityRecord`\>

Defined in: [src/scene/world/World.ts:326](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/world/World.ts#L326)

Iterator sobre todos os records (debugging / introspection).

#### Returns

`IterableIterator`\<`EntityRecord`\>

***

### attach()

> **attach**(`entity`, `component`): `void`

Defined in: [src/scene/world/World.ts:163](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/world/World.ts#L163)

Anexa `component` (e a árvore dele) a uma entidade já inserida — ex.: trocar o material de um corpo sem recriá-lo
(spec 017). Os recursos novos entram na cena (`resourcesChanged` com `added`) e a entidade é recomposta
(`entitiesRecomposed`): a C2 reavalia os registros e os slots de entidades dela.

#### Parameters

##### entity

[`Entity`](../../../elements/classes/Entity.md)\<`object`\>

##### component

[`Entity`](../../../elements/classes/Entity.md)\<`object`\>

#### Returns

`void`

#### Throws

ReuseError se `component` (ou um recurso da árvore dele) já está numa cena.

#### Throws

Error se `entity` não é uma raiz inserida neste World.

***

### detach()

> **detach**(`entity`, `component`): `boolean`

Defined in: [src/scene/world/World.ts:192](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/world/World.ts#L192)

Desanexa `component` (filho direto) de uma entidade inserida: os recursos dele saem da cena
(`resourcesChanged` com `removed`) e a entidade é recomposta (`entitiesRecomposed`). Devolve `false` se
`component` não é filho direto de `entity` ou `entity` não está inserida.

#### Parameters

##### entity

[`Entity`](../../../elements/classes/Entity.md)\<`object`\>

##### component

[`Entity`](../../../elements/classes/Entity.md)\<`object`\>

#### Returns

`boolean`

***

### entityIdOf()

> **entityIdOf**(`entity`): [`EntityId`](../type-aliases/EntityId.md) \| `undefined`

Defined in: [src/scene/world/World.ts:302](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/world/World.ts#L302)

Resolve uma Entity para seu EntityId. Undefined se não foi inserida.

#### Parameters

##### entity

[`Entity`](../../../elements/classes/Entity.md)\<`object`\>

#### Returns

[`EntityId`](../type-aliases/EntityId.md) \| `undefined`

***

### entityIdOfResource()

> **entityIdOfResource**(`resource`): [`EntityId`](../type-aliases/EntityId.md) \| `undefined`

Defined in: [src/scene/world/World.ts:310](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/world/World.ts#L310)

Mapeia um Resource (mesmo se for `parts` de um root) para o EntityId do root deste World que o contém.
`undefined` se o recurso não está inserido neste World (inclusive depois de `remove`).

#### Parameters

##### resource

[`Resource`](../interfaces/Resource.md)

#### Returns

[`EntityId`](../type-aliases/EntityId.md) \| `undefined`

***

### findResource()

> **findResource**\<`T`\>(`schema`, `type`): `T` \| `undefined`

Defined in: [src/scene/world/World.ts:279](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/world/World.ts#L279)

Primeiro Resource do tipo `type` entre as entidades que têm `schema` — consulta de recurso único da cena
(ex.: `Time`, campos globais). Reconhece pelo construtor (`instanceof`), que sobrevive à minificação.

#### Type Parameters

##### T

`T` *extends* [`Resource`](../interfaces/Resource.md)

#### Parameters

##### schema

[`Schema`](../interfaces/Schema.md)

##### type

(...`args`) => `T`

#### Returns

`T` \| `undefined`

***

### insert()

> **insert**(`entity`): [`EntityId`](../type-aliases/EntityId.md)

Defined in: [src/scene/world/World.ts:74](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/world/World.ts#L74)

Insere uma entity raiz (e seus filhos) no World. Coleta todos os
Resources da árvore (root + parts), atribui EntityId, indexa por
schema, emite `resourcesChanged`.

Reuso de instância é proibido: lança `ReuseError` ("instância já inserida — crie outra instância") se a
raiz já está inserida, se algum recurso da árvore pertence a outra raiz viva (deste ou de outro World) ou se
o mesmo recurso aparece duas vezes na árvore. Depois de `remove`, a mesma instância pode ser inserida de
novo.

#### Parameters

##### entity

[`Entity`](../../../elements/classes/Entity.md)\<`object`\>

#### Returns

[`EntityId`](../type-aliases/EntityId.md)

***

### queryBySchema()

> **queryBySchema**(`schema`): readonly [`EntityId`](../type-aliases/EntityId.md)[]

Defined in: [src/scene/world/World.ts:271](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/world/World.ts#L271)

Atalho: queryBySchemaName(schema.name).

#### Parameters

##### schema

[`Schema`](../interfaces/Schema.md)

#### Returns

readonly [`EntityId`](../type-aliases/EntityId.md)[]

***

### queryBySchemaName()

> **queryBySchemaName**(`name`): readonly [`EntityId`](../type-aliases/EntityId.md)[]

Defined in: [src/scene/world/World.ts:265](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/world/World.ts#L265)

Lista todos os EntityIds que contêm um Resource cujo schema tem
`name` (e.g. 'Camera', 'BoxVertex', 'RigidBody'). Eficiente — O(1)
lookup + O(N) cópia onde N = entities com aquele schema.

#### Parameters

##### name

`string`

#### Returns

readonly [`EntityId`](../type-aliases/EntityId.md)[]

***

### queryByTag()

> **queryByTag**(`tag`): readonly [`EntityId`](../type-aliases/EntityId.md)[]

Defined in: [src/scene/world/World.ts:255](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/world/World.ts#L255)

Lista todos os EntityIds que têm a `tag`. Cópia defensiva — modificável.

#### Parameters

##### tag

`string`

#### Returns

readonly [`EntityId`](../type-aliases/EntityId.md)[]

***

### remove()

> **remove**(`entity`): `void`

Defined in: [src/scene/world/World.ts:134](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/world/World.ts#L134)

Remove a entity do World — limpa indexes (schema, tag), libera
EntityId e emite `resourcesChanged` (com `removed`) + `entitiesRemoved`
(com `entityIds`). Sistemas reativos liberam recursos GPU.

#### Parameters

##### entity

[`Entity`](../../../elements/classes/Entity.md)\<`object`\>

#### Returns

`void`

***

### resourcesOf()

> **resourcesOf**(`id`): readonly [`Resource`](../interfaces/Resource.md)[]

Defined in: [src/scene/world/World.ts:296](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/world/World.ts#L296)

Lista os Resources do entityId — root + todos os parts agregados.

#### Parameters

##### id

[`EntityId`](../type-aliases/EntityId.md)

#### Returns

readonly [`Resource`](../interfaces/Resource.md)[]

***

### rootOf()

> **rootOf**(`id`): [`Entity`](../../../elements/classes/Entity.md)\<`object`\> \| `undefined`

Defined in: [src/scene/world/World.ts:321](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/world/World.ts#L321)

Resolve um EntityId para a Entity raiz inserida (ou undefined se removida).

#### Parameters

##### id

[`EntityId`](../type-aliases/EntityId.md)

#### Returns

[`Entity`](../../../elements/classes/Entity.md)\<`object`\> \| `undefined`
