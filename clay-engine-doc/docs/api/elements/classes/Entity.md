[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / Entity

# Abstract Class: Entity

Defined in: [scene/contracts/Entity.ts:55](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/scene/contracts/Entity.ts#L55)

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
do Resource: um acessor no protótipo — subclasses atribuem `this.data = …` no
construtor e **não** declaram o campo `data` (spec 007). Na cena, a C2 liga o
acessor ao proxy reativo (mutação de campo e reatribuição inteira marcam o
recurso) sem redefinir propriedades na instância: o objeto mantém a forma da
classe (um milhão de entidades sem objetos em modo dicionário).
Entity é abstrata — não pode ser instanciada diretamente.

## Extended by

- [`PostProcessEffect`](../../presentation/classes/PostProcessEffect.md)
- [`Time`](../../presentation/classes/Time.md)
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
- [`ParticleMaterial`](ParticleMaterial.md)
- [`ParticleEmitter`](ParticleEmitter.md)
- [`NeighborSearchGrid`](NeighborSearchGrid.md)
- [`EulerianGrid`](EulerianGrid.md)

## Constructors

### Constructor

> **new Entity**(): `Entity`

#### Returns

`Entity`

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly `Entity`[]

Defined in: [scene/contracts/Entity.ts:125](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/scene/contracts/Entity.ts#L125)

Lista somente-leitura dos filhos diretos. World.insert traverse essa
árvore recursivamente para coletar todos os Resources de um root.

##### Returns

readonly `Entity`[]

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

***

### rawData

#### Get Signature

> **get** `protected` **rawData**(): `Readonly`\<`Record`\<`string`, `unknown`\>\>

Defined in: [scene/contracts/Entity.ts:108](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/scene/contracts/Entity.ts#L108)

O dado cru, sem o proxy reativo — para leituras do próprio Resource (ex.: uma propriedade derivada consultada pelos
estágios) que não devem criar proxies aninhados. Escrever por aqui não marca o recurso.

##### Returns

`Readonly`\<`Record`\<`string`, `unknown`\>\>

## Methods

### add()

> **add**(`e`): `this`

Defined in: [scene/contracts/Entity.ts:116](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/scene/contracts/Entity.ts#L116)

Anexa uma Entity-filha. Retorna `this` para chaining fluente.
Não valida ciclos nem múltiplos pais — responsabilidade do caller.

#### Parameters

##### e

`Entity`

#### Returns

`this`
