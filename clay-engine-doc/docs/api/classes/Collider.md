# Abstract Class: Collider

Defined in: [scene/components/physics/Collider.ts:28](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/physics/Collider.ts#L28)

Base abstrata para todos os volumes de colisão (Template Method — GoF).

Expõe primitivas geométricas suficientes para que os NarrowphaseTests
operem exclusivamente sobre esta interface — sem importar tipos concretos.
O mesmo princípio que PhysicsSolver usa PhysicsBody sem conhecer RigidBody.

Não implementa Resource: colliders são descritores de forma CPU-side,
sem alocação de buffer GPU própria.

Apenas um Collider por Entity (type = 'Collider' → chave única no layer 1).

Para criar um collider concreto, implemente esta classe diretamente
ou use SDFCollider (factories/physics/) como conveniência para espaços euclidianos.

## Extended by

- [`SDFCollider`](SDFCollider.md)

## Implements

- [`Physic`](../interfaces/Physic.md)

## Constructors

### Constructor

> **new Collider**(): `Collider`

#### Returns

`Collider`

## Properties

### colliderShape

> `abstract` `readonly` **colliderShape**: `string`

Defined in: [scene/components/physics/Collider.ts:35](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/physics/Collider.ts#L35)

Identificador canônico da forma (ex: 'sphere', 'box', 'plane').

***

### layer

> `readonly` **layer**: [`PHYSICS_MECHANIC`](../enumerations/ResourceType.md#physics_mechanic)

Defined in: [scene/components/physics/Collider.ts:31](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/physics/Collider.ts#L31)

#### Implementation of

[`Physic`](../interfaces/Physic.md).[`layer`](../interfaces/Physic.md#layer)

***

### physicType

> `readonly` **physicType**: `"Collider"` = `'Collider'`

Defined in: [scene/components/physics/Collider.ts:32](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/physics/Collider.ts#L32)

#### Implementation of

[`Physic`](../interfaces/Physic.md).[`physicType`](../interfaces/Physic.md#physictype)

***

### type

> `readonly` **type**: `"Collider"` = `'Collider'`

Defined in: [scene/components/physics/Collider.ts:30](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/physics/Collider.ts#L30)

Chave única no layer 1 — garante um único Collider por Entity.

## Methods

### computeInertiaTensor()

> `abstract` **computeInertiaTensor**(`mass`): \[`number`, `number`, `number`\]

Defined in: [scene/components/physics/Collider.ts:81](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/physics/Collider.ts#L81)

Tensor de inércia diagonal para esta forma, dado uma massa.

#### Parameters

##### mass

`number`

#### Returns

\[`number`, `number`, `number`\]

***

### getAABB()

> `abstract` **getAABB**(`worldMatrix`): `AABB`

Defined in: [scene/components/physics/Collider.ts:43](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/physics/Collider.ts#L43)

AABB conservador no espaço de mundo (para broadphase).

#### Parameters

##### worldMatrix

`mat4`

#### Returns

`AABB`

***

### getBoundingRadius()

> `abstract` **getBoundingRadius**(`worldMatrix`): `number`

Defined in: [scene/components/physics/Collider.ts:53](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/physics/Collider.ts#L53)

Raio da esfera circunscrita no espaço de mundo.
Esferas: radius * maxScale.
Boxes: comprimento da diagonal de halfExtents * maxScale.

#### Parameters

##### worldMatrix

`mat4`

#### Returns

`number`

***

### getClosestPoint()

> `abstract` **getClosestPoint**(`worldMatrix`, `queryPoint`): `vec3`

Defined in: [scene/components/physics/Collider.ts:61](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/physics/Collider.ts#L61)

Ponto na superfície (ou interior) da forma mais próximo de um ponto externo.
Usado pelo narrowphase sem conhecer a forma concreta.
Esferas: ponto na superfície em direção ao queryPoint.
Boxes: projeção do queryPoint no AABB orientado.

#### Parameters

##### worldMatrix

`mat4`

##### queryPoint

`vec3`

#### Returns

`vec3`

***

### getLocalHalfExtents()?

> `optional` **getLocalHalfExtents**(): \[`number`, `number`, `number`\]

Defined in: [scene/components/physics/Collider.ts:78](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/physics/Collider.ts#L78)

Semi-extensões da forma em espaço local (antes de qualquer transformação).
Usado pelo SATAlgorithm para extrair dimensões do OBB sem depender do tipo concreto.
Caixas: [halfWidth, halfHeight, halfDepth].

#### Returns

\[`number`, `number`, `number`\]

***

### getWorldCenter()

> `abstract` **getWorldCenter**(`worldMatrix`): `vec3`

Defined in: [scene/components/physics/Collider.ts:46](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/physics/Collider.ts#L46)

Centro do volume no espaço de mundo.

#### Parameters

##### worldMatrix

`mat4`

#### Returns

`vec3`

***

### getWorldVertices()?

> `optional` **getWorldVertices**(`worldMatrix`): `vec3`[]

Defined in: [scene/components/physics/Collider.ts:71](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/physics/Collider.ts#L71)

Vértices da forma em espaço de mundo — implementado por poliedros (BoxShape).
Usado pelo PlaneBoxCollision para manifold multi-ponto sem cast para tipo concreto.
Retorna array vazio por default; formas sem vértices explícitos não o implementam.

#### Parameters

##### worldMatrix

`mat4`

#### Returns

`vec3`[]

***

### packDescriptor()

> `abstract` **packDescriptor**(): `object`

Defined in: [scene/components/physics/Collider.ts:92](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/physics/Collider.ts#L92)

Serializa a forma para o descritor compacto usado pela GPU.

- `shapeType`: 0 = esfera, 1 = caixa, 2 = plano.
- `half`: 4 floats cujo significado depende do `shapeType`
          (raio / semi-extensões / normal+offset).

Elimina `instanceof SphereShape/BoxShape/PlaneShape` nos uploaders GPU.

#### Returns

`object`

##### bounds

> **bounds**: \[`number`, `number`\]

##### half

> **half**: \[`number`, `number`, `number`, `number`\]

##### shapeType

> **shapeType**: `number`

***

### sdf()?

> `optional` **sdf**(`localPoint`): `number`

Defined in: [scene/components/physics/Collider.ts:64](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/physics/Collider.ts#L64)

SDF opcional em espaço local — implementado por SDFCollider e subclasses que suportam testes genéricos.

#### Parameters

##### localPoint

`vec3`

#### Returns

`number`
