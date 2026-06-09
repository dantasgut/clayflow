[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / Entity

# Abstract Class: Entity

Defined in: [scene/contracts/Entity.ts:20](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/scene/contracts/Entity.ts#L20)

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

## Extended by

- [`PostProcessEffect`](../../presentation/classes/PostProcessEffect.md)
- [`Time`](../../presentation/classes/Time.md)
- [`Scene`](Scene.md)
- [`Transform`](Transform.md)
- [`Camera`](Camera.md)
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

Defined in: [scene/contracts/Entity.ts:41](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/scene/contracts/Entity.ts#L41)

Lista somente-leitura dos filhos diretos. World.insert traverse essa
árvore recursivamente para coletar todos os Resources de um root.

##### Returns

readonly `Entity`[]

## Methods

### add()

> **add**(`e`): `this`

Defined in: [scene/contracts/Entity.ts:32](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/scene/contracts/Entity.ts#L32)

Anexa uma Entity-filha. Retorna `this` para chaining fluente.
Não valida ciclos nem múltiplos pais — responsabilidade do caller.

#### Parameters

##### e

`Entity`

#### Returns

`this`
