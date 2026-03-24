[**webgpu-engine**](../README.md)

***

[webgpu-engine](../README.md) / AABBBroadphase

# Class: AABBBroadphase

Defined in: [elements/physics/AABBBroadphase.ts:20](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/elements/physics/AABBBroadphase.ts#L20)

Broadphase euclidiano via sobreposição de AABB (O(n²)).
Implementação concreta de Broadphase para espaços com métrica euclidiana.

Para cenas grandes, substitua por BVHBroadphase ou SpatialHashBroadphase
registrando uma nova implementação de Broadphase no PhysicsWorld.

## Implements

- `Broadphase`

## Constructors

### Constructor

> **new AABBBroadphase**(): `AABBBroadphase`

#### Returns

`AABBBroadphase`

## Methods

### findCandidatePairs()

> **findCandidatePairs**(`entries`): \[`ColliderEntry`, `ColliderEntry`\][]

Defined in: [elements/physics/AABBBroadphase.ts:21](https://github.com/dantasgut/clayflow/blob/a3b4ea2a6166599e51db22c402b4fb15c8973479/src/elements/physics/AABBBroadphase.ts#L21)

Retorna todos os pares de entradas que podem estar em colisão.
Chamado uma vez por step, antes do narrowphase.

#### Parameters

##### entries

readonly `ColliderEntry`[]

#### Returns

\[`ColliderEntry`, `ColliderEntry`\][]

#### Implementation of

`Broadphase.findCandidatePairs`
