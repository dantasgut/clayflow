[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / Scene

# Class: Scene

Defined in: [elements/scene/Scene.ts:5](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/scene/Scene.ts#L5)

Entity é a unidade composicional da Camada 2 (Sync) — qualquer objeto
inserido em `World` herda de Entity. A composição é via `add(child)`:
uma Entity-pai agrega Entity-filhas em uma árvore plana, e
`World.insert(root)` percorre a árvore registrando cada filho como
`Resource` indexável.

Padrão de uso típico:
```ts
const box = new BoxGeometry({ size: [1, 1, 1] });
box.add(new StandardMaterial({ albedo: [0.7, 0.3, 0.2, 1] }));
box.add(new Transform({ position: [0, 0, 0, 1] }));
world.insert(box);  // registra geometria + material + transform
```

Subclasses concretas (Camera, Transform, BoxGeometry, etc.) implementam
`Resource` (descritores GPU + dados), enquanto Entity puro provê apenas
a hierarquia. Entity é abstrata — não pode ser instanciada diretamente.

## Extends

- [`Entity`](Entity.md)

## Constructors

### Constructor

> **new Scene**(`world`): `Scene`

Defined in: [elements/scene/Scene.ts:6](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/scene/Scene.ts#L6)

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

Defined in: [scene/contracts/Entity.ts:41](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/scene/contracts/Entity.ts#L41)

Lista somente-leitura dos filhos diretos. World.insert traverse essa
árvore recursivamente para coletar todos os Resources de um root.

##### Returns

readonly [`Entity`](Entity.md)[]

#### Inherited from

[`Entity`](Entity.md).[`attached`](Entity.md#attached)

## Methods

### add()

> **add**(`e`): `this`

Defined in: [scene/contracts/Entity.ts:32](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/scene/contracts/Entity.ts#L32)

Anexa uma Entity-filha. Retorna `this` para chaining fluente.
Não valida ciclos nem múltiplos pais — responsabilidade do caller.

#### Parameters

##### e

[`Entity`](Entity.md)

#### Returns

`this`

#### Inherited from

[`Entity`](Entity.md).[`add`](Entity.md#add)

***

### addEntity()

> **addEntity**(`entity`): `EntityId`

Defined in: [elements/scene/Scene.ts:14](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/scene/Scene.ts#L14)

Insere uma entidade na cena: adiciona como part do Scene (composição) +
registra no World (visibilidade para flows). Retorna o EntityId atribuído.

#### Parameters

##### entity

[`Entity`](Entity.md)

#### Returns

`EntityId`

***

### removeEntity()

> **removeEntity**(`entity`): `void`

Defined in: [elements/scene/Scene.ts:20](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/scene/Scene.ts#L20)

Remove a entidade do World (flows param de processá-la no próximo tick).

#### Parameters

##### entity

[`Entity`](Entity.md)

#### Returns

`void`
