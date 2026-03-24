# Class: BoxShape

Defined in: [elements/physics/shapes/BoxShape.ts:16](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/physics/shapes/BoxShape.ts#L16)

Forma de colisão cúbica. (Camada 3)

SDF (Inigo Quilez):
  q = |p| - h
  d = |max(q, 0)| + min(max(qx, qy, qz), 0)

Substitui getAABB herdado da SDFCollider (esférico, conservador demais)
por uma AABB justa — centro ± halfExtents * escala por eixo.
Sem isso, a broadphase detecta colisões fantasma ~70% antes do contato real.

## Extends

- [`SDFCollider`](SDFCollider.md)

## Constructors

### Constructor

> **new BoxShape**(`halfWidth?`, `halfHeight?`, `halfDepth?`): `BoxShape`

Defined in: [elements/physics/shapes/BoxShape.ts:21](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/physics/shapes/BoxShape.ts#L21)

#### Parameters

##### halfWidth?

`number` = `0.5`

##### halfHeight?

`number` = `0.5`

##### halfDepth?

`number` = `0.5`

#### Returns

`BoxShape`

#### Overrides

[`SDFCollider`](SDFCollider.md).[`constructor`](SDFCollider.md#constructor)

## Properties

### boundingRadiusVal

> `protected` `readonly` **boundingRadiusVal**: `number`

Defined in: [elements/physics/shapes/SDFCollider.ts:54](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/physics/shapes/SDFCollider.ts#L54)

#### Inherited from

[`SDFCollider`](SDFCollider.md).[`boundingRadiusVal`](SDFCollider.md#boundingradiusval)

***

### colliderShape

> `readonly` **colliderShape**: `string`

Defined in: [elements/physics/shapes/SDFCollider.ts:51](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/physics/shapes/SDFCollider.ts#L51)

Identificador da forma, usado pelo CollisionDispatcher para selecionar o teste.

#### Inherited from

[`SDFCollider`](SDFCollider.md).[`colliderShape`](SDFCollider.md#collidershape)

***

### layer

> `readonly` **layer**: [`PHYSICS_MECHANIC`](../enumerations/ResourceType.md#physics_mechanic)

Defined in: [scene/components/physics/Collider.ts:31](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/components/physics/Collider.ts#L31)

#### Inherited from

[`SDFCollider`](SDFCollider.md).[`layer`](SDFCollider.md#layer)

***

### physicType

> `readonly` **physicType**: `"Collider"` = `'Collider'`

Defined in: [scene/components/physics/Collider.ts:32](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/components/physics/Collider.ts#L32)

#### Inherited from

[`SDFCollider`](SDFCollider.md).[`physicType`](SDFCollider.md#physictype)

***

### type

> `readonly` **type**: `"Collider"` = `'Collider'`

Defined in: [scene/components/physics/Collider.ts:30](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/components/physics/Collider.ts#L30)

Chave única no layer 1 — garante um único Collider por Entity.

#### Inherited from

[`SDFCollider`](SDFCollider.md).[`type`](SDFCollider.md#type)

## Methods

### computeInertiaTensor()

> **computeInertiaTensor**(`mass`): \[`number`, `number`, `number`\]

Defined in: [elements/physics/shapes/BoxShape.ts:45](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/physics/shapes/BoxShape.ts#L45)

Tensor de inércia diagonal para esta forma, dado uma massa.

#### Parameters

##### mass

`number`

#### Returns

\[`number`, `number`, `number`\]

#### Overrides

[`SDFCollider`](SDFCollider.md).[`computeInertiaTensor`](SDFCollider.md#computeinertiatensor)

***

### getAABB()

> **getAABB**(`worldMatrix`): `AABB`

Defined in: [elements/physics/shapes/BoxShape.ts:118](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/physics/shapes/BoxShape.ts#L118)

AABB mínima que contém o OBB rotacionado.
Fórmula: half_i = Σ_j |R_ij| * localHalfExtent_j
onde R é a matriz de rotação (colunas da worldMatrix, normalizadas).
Correto para caixas com qualquer rotação.

#### Parameters

##### worldMatrix

`mat4`

#### Returns

`AABB`

#### Overrides

[`SDFCollider`](SDFCollider.md).[`getAABB`](SDFCollider.md#getaabb)

***

### getBoundingRadius()

> **getBoundingRadius**(`worldMatrix`): `number`

Defined in: [elements/physics/shapes/SDFCollider.ts:84](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/physics/shapes/SDFCollider.ts#L84)

Raio da esfera circunscrita no espaço de mundo.
Esferas: radius * maxScale.
Boxes: comprimento da diagonal de halfExtents * maxScale.

#### Parameters

##### worldMatrix

`mat4`

#### Returns

`number`

#### Inherited from

[`SDFCollider`](SDFCollider.md).[`getBoundingRadius`](SDFCollider.md#getboundingradius)

***

### getClosestPoint()

> **getClosestPoint**(`worldMatrix`, `queryPoint`): `vec3`

Defined in: [elements/physics/shapes/BoxShape.ts:84](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/physics/shapes/BoxShape.ts#L84)

Ponto mais próximo na superfície do OBB ao queryPoint — analítico, sem gradient descent.
Para pontos externos: clamp aos half-extents → suporte exato (vértice mais profundo).
Para pontos internos: projeta na face mais próxima.

#### Parameters

##### worldMatrix

`mat4`

##### queryPoint

`vec3`

#### Returns

`vec3`

#### Overrides

[`SDFCollider`](SDFCollider.md).[`getClosestPoint`](SDFCollider.md#getclosestpoint)

***

### getLocalHalfExtents()

> **getLocalHalfExtents**(): \[`number`, `number`, `number`\]

Defined in: [elements/physics/shapes/BoxShape.ts:54](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/physics/shapes/BoxShape.ts#L54)

Semi-extensões locais — usadas pelo SATAlgorithm para extrair dimensões do OBB.

#### Returns

\[`number`, `number`, `number`\]

#### Overrides

[`SDFCollider`](SDFCollider.md).[`getLocalHalfExtents`](SDFCollider.md#getlocalhalfextents)

***

### getWorldCenter()

> **getWorldCenter**(`worldMatrix`): `vec3`

Defined in: [elements/physics/shapes/SDFCollider.ts:80](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/physics/shapes/SDFCollider.ts#L80)

Centro do volume no espaço de mundo.

#### Parameters

##### worldMatrix

`mat4`

#### Returns

`vec3`

#### Inherited from

[`SDFCollider`](SDFCollider.md).[`getWorldCenter`](SDFCollider.md#getworldcenter)

***

### getWorldVertices()

> **getWorldVertices**(`worldMatrix`): `vec3`[]

Defined in: [elements/physics/shapes/BoxShape.ts:63](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/physics/shapes/BoxShape.ts#L63)

Os 8 vértices do OBB em espaço de mundo.
Implementa Collider.getWorldVertices? — usado pelo PlaneBoxCollision
para gerar manifold multi-ponto sem acoplar ao tipo concreto BoxShape.

#### Parameters

##### worldMatrix

`mat4`

#### Returns

`vec3`[]

#### Overrides

[`SDFCollider`](SDFCollider.md).[`getWorldVertices`](SDFCollider.md#getworldvertices)

***

### sdf()

> **sdf**(`localPoint`): `number`

Defined in: [elements/physics/shapes/SDFCollider.ts:76](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/physics/shapes/SDFCollider.ts#L76)

SDF em espaço local — disponível para testes narrowphase customizados.

#### Parameters

##### localPoint

`vec3`

#### Returns

`number`

#### Inherited from

[`SDFCollider`](SDFCollider.md).[`sdf`](SDFCollider.md#sdf)
