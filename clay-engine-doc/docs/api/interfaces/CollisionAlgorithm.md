# Interface: CollisionAlgorithm

Defined in: [scene/systems/collision/CollisionAlgorithm.ts:13](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/systems/collision/CollisionAlgorithm.ts#L13)

Interface do algoritmo de narrowphase (Strategy — GoF).

Recebe apenas tipos base Collider + matrizes de mundo.
Nunca importa tipos concretos —
opera exclusivamente via primitivas geométricas abstratas do Collider.
O CollisionDispatcher garante a ordem canônica (alfabética por colliderShape).

## Methods

### detect()

> **detect**(`a`, `aWorldMatrix`, `b`, `bWorldMatrix`): `CollisionManifold` \| `null`

Defined in: [scene/systems/collision/CollisionAlgorithm.ts:14](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/systems/collision/CollisionAlgorithm.ts#L14)

#### Parameters

##### a

[`Collider`](../classes/Collider.md)

##### aWorldMatrix

`mat4`

##### b

[`Collider`](../classes/Collider.md)

##### bWorldMatrix

`mat4`

#### Returns

`CollisionManifold` \| `null`
