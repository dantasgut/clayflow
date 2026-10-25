[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / Entity

# Abstract Class: Entity\<TData\>

Defined in: [scene/contracts/Entity.ts:57](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/scene/contracts/Entity.ts#L57)

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
`Resource` (descritores GPU), enquanto Entity provê a hierarquia e o `data`
do Resource: um acessor no protótipo, tipado pelo parâmetro `TData`
(`class Camera extends Entity<CameraData>`). Subclasses atribuem `this.data = …`
no construtor e não declaram o campo `data` — um campo próprio na instância
esconderia o acessor e as mutações não marcariam o envio. Na cena, a C2 liga o
acessor ao proxy reativo (mutação de campo e reatribuição inteira marcam o
recurso) sem redefinir propriedades na instância: o objeto mantém a forma da
classe (um milhão de entidades sem objetos em modo dicionário).
Entity é abstrata — não pode ser instanciada diretamente.

## Extended by

- [`PostProcessEffect`](../../presentation/classes/PostProcessEffect.md)
- [`Time`](../../presentation/classes/Time.md)
- [`WaterSurface`](../../presentation/classes/WaterSurface.md)
- [`Input`](../../presentation/classes/Input.md)
- [`InputDrivenController`](../../presentation/classes/InputDrivenController.md)
- [`Scene`](Scene.md)
- [`Transform`](Transform.md)
- [`Camera`](Camera.md)
- [`Parent`](Parent.md)
- [`Light`](Light.md)
- [`ShadowMap`](ShadowMap.md)
- [`CanvasRenderTarget`](CanvasRenderTarget.md)
- [`OffscreenRenderTarget`](OffscreenRenderTarget.md)
- [`Geometry`](Geometry.md)
- [`Material`](Material.md)
- [`PhysicsBody`](PhysicsBody.md)
- [`ForceField`](ForceField.md)
- [`Collider`](Collider.md)
- [`Constraint`](Constraint.md)
- [`ParticlePhysics`](ParticlePhysics.md)
- [`ParticleEmitter`](ParticleEmitter.md)
- [`DiffuseParticles`](DiffuseParticles.md)
- [`NeighborSearchGrid`](NeighborSearchGrid.md)
- [`EulerianGrid`](EulerianGrid.md)

## Type Parameters

### TData

`TData` *extends* `object` = `Record`\<`string`, `unknown`\>

## Constructors

### Constructor

> **new Entity**\<`TData`\>(): `Entity`\<`TData`\>

#### Returns

`Entity`\<`TData`\>

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly `Entity`\<`object`\>[]

Defined in: [scene/contracts/Entity.ts:138](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/scene/contracts/Entity.ts#L138)

Lista somente-leitura dos filhos diretos. World.insert traverse essa
árvore recursivamente para coletar todos os Resources de um root.

##### Returns

readonly `Entity`\<`object`\>[]

***

### data

#### Get Signature

> **get** **data**(): `TData`

Defined in: [scene/contracts/Entity.ts:90](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/scene/contracts/Entity.ts#L90)

Dados do Resource (o layout é o do schema dos descritores). Na cena, mutações de campo (`data.position = …`,
`data.position[0] = …`) e a reatribuição inteira (`data = …`) marcam o recurso para envio.

##### Returns

`TData`

#### Set Signature

> **set** **data**(`next`): `void`

Defined in: [scene/contracts/Entity.ts:96](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/scene/contracts/Entity.ts#L96)

Troca o dado inteiro; na cena, o recurso inteiro é marcado para envio.

##### Parameters

###### next

`TData`

##### Returns

`void`

***

### rawData

#### Get Signature

> **get** `protected` **rawData**(): `Readonly`\<`TData`\>

Defined in: [scene/contracts/Entity.ts:110](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/scene/contracts/Entity.ts#L110)

O dado cru, sem o proxy reativo — para leituras do próprio Resource (ex.: uma propriedade derivada consultada pelos
estágios) que não devem criar proxies aninhados. Escrever por aqui não marca o recurso.

##### Returns

`Readonly`\<`TData`\>

## Methods

### add()

> **add**(`e`): `this`

Defined in: [scene/contracts/Entity.ts:118](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/scene/contracts/Entity.ts#L118)

Anexa uma Entity-filha. Retorna `this` para chaining fluente.
Não valida ciclos nem múltiplos pais — responsabilidade do caller.

#### Parameters

##### e

`Entity`\<`object`\>

#### Returns

`this`

***

### detach()

> **detach**(`e`): `boolean`

Defined in: [scene/contracts/Entity.ts:127](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/scene/contracts/Entity.ts#L127)

Desanexa uma Entity-filha direta (inverso de `add`). Devolve `false` se ela não é filha desta. Numa entidade já
inserida, use `World.detach` (que também atualiza a cena).

#### Parameters

##### e

`Entity`\<`object`\>

#### Returns

`boolean`
