[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / Scene

# Class: Scene

Defined in: [elements/scene/Scene.ts:10](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/scene/Scene.ts#L10)

Raiz da cena. `add(entity)` e `addEntity(entity)` inserem a entidade no World (visível aos Flows) e a anexam como
filha da cena; `add` devolve `this` (encadeável), `addEntity` devolve o `EntityId`. Para anexar um filho a outra
entidade (sem inserir), use o `add` dessa entidade (`Entity.add`).

## Extends

- [`Entity`](Entity.md)

## Constructors

### Constructor

> **new Scene**(`world`): `Scene`

Defined in: [elements/scene/Scene.ts:11](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/scene/Scene.ts#L11)

#### Parameters

##### world

`World`

#### Returns

`Scene`

#### Overrides

[`Entity`](Entity.md).[`constructor`](Entity.md#constructor)

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](Entity.md)[]

Defined in: [scene/contracts/Entity.ts:125](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/scene/contracts/Entity.ts#L125)

Lista somente-leitura dos filhos diretos. World.insert traverse essa
árvore recursivamente para coletar todos os Resources de um root.

##### Returns

readonly [`Entity`](Entity.md)[]

#### Inherited from

[`Entity`](Entity.md).[`attached`](Entity.md#attached)

***

### data

#### Get Signature

> **get** **data**(): `Record`\<`string`, `unknown`\>

Defined in: [scene/contracts/Entity.ts:88](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/scene/contracts/Entity.ts#L88)

Dados do Resource (o layout é o do schema dos descritores). Na cena, mutações de campo (`data.position = …`,
`data.position[0] = …`) e a reatribuição inteira (`data = …`) marcam o recurso para envio.

##### Returns

`Record`\<`string`, `unknown`\>

#### Set Signature

> **set** **data**(`next`): `void`

Defined in: [scene/contracts/Entity.ts:94](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/scene/contracts/Entity.ts#L94)

Troca o dado inteiro; na cena, o recurso inteiro é marcado para envio.

##### Parameters

###### next

`Record`\<`string`, `unknown`\>

##### Returns

`void`

#### Inherited from

[`Entity`](Entity.md).[`data`](Entity.md#data)

***

### rawData

#### Get Signature

> **get** `protected` **rawData**(): `Readonly`\<`Record`\<`string`, `unknown`\>\>

Defined in: [scene/contracts/Entity.ts:108](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/scene/contracts/Entity.ts#L108)

O dado cru, sem o proxy reativo — para leituras do próprio Resource (ex.: uma propriedade derivada consultada pelos
estágios) que não devem criar proxies aninhados. Escrever por aqui não marca o recurso.

##### Returns

`Readonly`\<`Record`\<`string`, `unknown`\>\>

#### Inherited from

[`Entity`](Entity.md).[`rawData`](Entity.md#rawdata)

## Methods

### add()

> **add**(`entity`): `this`

Defined in: [elements/scene/Scene.ts:16](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/scene/Scene.ts#L16)

Insere a entidade no World e a anexa à cena. Encadeável. Reuso de instância lança `ReuseError`.

#### Parameters

##### entity

[`Entity`](Entity.md)

#### Returns

`this`

#### Overrides

[`Entity`](Entity.md).[`add`](Entity.md#add)

***

### addEntity()

> **addEntity**(`entity`): `EntityId`

Defined in: [elements/scene/Scene.ts:25](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/scene/Scene.ts#L25)

Insere a entidade no World e a anexa à cena; devolve o EntityId atribuído. Reuso de instância lança
`ReuseError` e nada é anexado.

#### Parameters

##### entity

[`Entity`](Entity.md)

#### Returns

`EntityId`

***

### removeEntity()

> **removeEntity**(`entity`): `void`

Defined in: [elements/scene/Scene.ts:32](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/scene/Scene.ts#L32)

Remove a entidade do World (flows param de processá-la no próximo tick).

#### Parameters

##### entity

[`Entity`](Entity.md)

#### Returns

`void`
