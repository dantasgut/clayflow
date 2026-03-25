# Interface: CollisionAlgorithm

Defined in: [scene/systems/collision/CollisionAlgorithm.ts:13](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/systems/collision/CollisionAlgorithm.ts#L13)

Interface do algoritmo de narrowphase (Strategy — GoF).

Recebe apenas tipos base Collider + matrizes de mundo.
Nunca importa tipos concretos —
opera exclusivamente via primitivas geométricas abstratas do Collider.
O CollisionDispatcher garante a ordem canônica (alfabética por colliderShape).

## Methods

### detect()

> **detect**(`a`, `aWorldMatrix`, `b`, `bWorldMatrix`): `CollisionManifold` \| `null`

Defined in: [scene/systems/collision/CollisionAlgorithm.ts:14](https://github.com/dantasgut/clayflow/blob/c86fce0a7735698989d78d56ab3a1c0f3b119da1/src/scene/systems/collision/CollisionAlgorithm.ts#L14)

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
