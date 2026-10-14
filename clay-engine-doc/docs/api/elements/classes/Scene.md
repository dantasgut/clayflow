[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / Scene

# Class: Scene

Defined in: [elements/scene/Scene.ts:10](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/scene/Scene.ts#L10)

Raiz da cena. `add(entity)` e `addEntity(entity)` inserem a entidade no World (visível aos Flows) e a anexam como
filha da cena; `add` devolve `this` (encadeável), `addEntity` devolve o `EntityId`. Para anexar um filho a outra
entidade (sem inserir), use o `add` dessa entidade (`Entity.add`).

## Extends

- [`Entity`](Entity.md)\<`Record`\<`string`, `never`\>\>

## Constructors

### Constructor

> **new Scene**(`world`): `Scene`

Defined in: [elements/scene/Scene.ts:11](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/scene/Scene.ts#L11)

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

> **get** **attached**(): readonly [`Entity`](Entity.md)\<`object`\>[]

Defined in: [scene/contracts/Entity.ts:138](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/scene/contracts/Entity.ts#L138)

Lista somente-leitura dos filhos diretos. World.insert traverse essa
árvore recursivamente para coletar todos os Resources de um root.

##### Returns

readonly [`Entity`](Entity.md)\<`object`\>[]

#### Inherited from

[`Entity`](Entity.md).[`attached`](Entity.md#attached)

***

### data

#### Get Signature

> **get** **data**(): `TData`

Defined in: [scene/contracts/Entity.ts:90](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/scene/contracts/Entity.ts#L90)

Dados do Resource (o layout é o do schema dos descritores). Na cena, mutações de campo (`data.position = …`,
`data.position[0] = …`) e a reatribuição inteira (`data = …`) marcam o recurso para envio.

##### Returns

`TData`

#### Set Signature

> **set** **data**(`next`): `void`

Defined in: [scene/contracts/Entity.ts:96](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/scene/contracts/Entity.ts#L96)

Troca o dado inteiro; na cena, o recurso inteiro é marcado para envio.

##### Parameters

###### next

`TData`

##### Returns

`void`

#### Inherited from

[`Entity`](Entity.md).[`data`](Entity.md#data)

***

### rawData

#### Get Signature

> **get** `protected` **rawData**(): `Readonly`\<`TData`\>

Defined in: [scene/contracts/Entity.ts:110](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/scene/contracts/Entity.ts#L110)

O dado cru, sem o proxy reativo — para leituras do próprio Resource (ex.: uma propriedade derivada consultada pelos
estágios) que não devem criar proxies aninhados. Escrever por aqui não marca o recurso.

##### Returns

`Readonly`\<`TData`\>

#### Inherited from

[`Entity`](Entity.md).[`rawData`](Entity.md#rawdata)

## Methods

### add()

> **add**(`entity`): `this`

Defined in: [elements/scene/Scene.ts:16](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/scene/Scene.ts#L16)

Insere a entidade no World e a anexa à cena. Encadeável. Reuso de instância lança `ReuseError`.

#### Parameters

##### entity

[`Entity`](Entity.md)\<`object`\>

#### Returns

`this`

#### Overrides

[`Entity`](Entity.md).[`add`](Entity.md#add)

***

### addEntity()

> **addEntity**(`entity`): `EntityId`

Defined in: [elements/scene/Scene.ts:25](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/scene/Scene.ts#L25)

Insere a entidade no World e a anexa à cena; devolve o EntityId atribuído. Reuso de instância lança
`ReuseError` e nada é anexado.

#### Parameters

##### entity

[`Entity`](Entity.md)\<`object`\>

#### Returns

`EntityId`

***

### detach()

> **detach**(`e`): `boolean`

Defined in: [scene/contracts/Entity.ts:127](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/scene/contracts/Entity.ts#L127)

Desanexa uma Entity-filha direta (inverso de `add`). Devolve `false` se ela não é filha desta. Numa entidade já
inserida, use `World.detach` (que também atualiza a cena).

#### Parameters

##### e

[`Entity`](Entity.md)\<`object`\>

#### Returns

`boolean`

#### Inherited from

[`Entity`](Entity.md).[`detach`](Entity.md#detach)

***

### removeEntity()

> **removeEntity**(`entity`): `void`

Defined in: [elements/scene/Scene.ts:32](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/scene/Scene.ts#L32)

Remove a entidade do World (flows param de processá-la no próximo tick).

#### Parameters

##### entity

[`Entity`](Entity.md)\<`object`\>

#### Returns

`void`
