[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / Scene

# Class: Scene

Defined in: [elements/scene/Scene.ts:10](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/scene/Scene.ts#L10)

Raiz da cena. `add(entity)` e `addEntity(entity)` inserem a entidade no World (visível aos Flows) e a anexam como
filha da cena; `add` devolve `this` (encadeável), `addEntity` devolve o `EntityId`. Para anexar um filho a outra
entidade (sem inserir), use o `add` dessa entidade (`Entity.add`).

## Extends

- [`Entity`](Entity.md)

## Constructors

### Constructor

> **new Scene**(`world`): `Scene`

Defined in: [elements/scene/Scene.ts:11](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/scene/Scene.ts#L11)

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

Defined in: [scene/contracts/Entity.ts:41](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/scene/contracts/Entity.ts#L41)

Lista somente-leitura dos filhos diretos. World.insert traverse essa
árvore recursivamente para coletar todos os Resources de um root.

##### Returns

readonly [`Entity`](Entity.md)[]

#### Inherited from

[`Entity`](Entity.md).[`attached`](Entity.md#attached)

## Methods

### add()

> **add**(`entity`): `this`

Defined in: [elements/scene/Scene.ts:16](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/scene/Scene.ts#L16)

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

Defined in: [elements/scene/Scene.ts:25](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/scene/Scene.ts#L25)

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

Defined in: [elements/scene/Scene.ts:32](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/scene/Scene.ts#L32)

Remove a entidade do World (flows param de processá-la no próximo tick).

#### Parameters

##### entity

[`Entity`](Entity.md)

#### Returns

`void`
