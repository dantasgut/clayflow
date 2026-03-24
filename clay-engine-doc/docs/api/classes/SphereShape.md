# Class: SphereShape

Defined in: [elements/physics/shapes/SphereShape.ts:10](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/physics/shapes/SphereShape.ts#L10)

Forma de colisão esférica. (Camada 3)

SDF: |p| - r  (distância ao centro menos o raio)
Registra como shape: 'Sphere' — usa SphereSphereTest e BoxSphereTest otimizados
quando registrados no CollisionDispatcher.

## Extends

- [`SDFCollider`](SDFCollider.md)

## Constructors

### Constructor

> **new SphereShape**(`radius?`): `SphereShape`

Defined in: [elements/physics/shapes/SphereShape.ts:13](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/physics/shapes/SphereShape.ts#L13)

#### Parameters

##### radius?

`number` = `0.5`

#### Returns

`SphereShape`

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

Defined in: [elements/physics/shapes/SphereShape.ts:22](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/physics/shapes/SphereShape.ts#L22)

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

Defined in: [elements/physics/shapes/SDFCollider.ts:109](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/physics/shapes/SDFCollider.ts#L109)

AABB conservador derivado da esfera circunscrita.

#### Parameters

##### worldMatrix

`mat4`

#### Returns

`AABB`

#### Inherited from

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

Defined in: [elements/physics/shapes/SDFCollider.ts:92](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/physics/shapes/SDFCollider.ts#L92)

Ponto mais próximo na superfície via gradient descent no SDF.
Projeta o queryPoint (mundo) para a superfície da forma.

#### Parameters

##### worldMatrix

`mat4`

##### queryPoint

`vec3`

#### Returns

`vec3`

#### Inherited from

[`SDFCollider`](SDFCollider.md).[`getClosestPoint`](SDFCollider.md#getclosestpoint)

***

### getLocalHalfExtents()?

> `optional` **getLocalHalfExtents**(): \[`number`, `number`, `number`\]

Defined in: [scene/components/physics/Collider.ts:78](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/components/physics/Collider.ts#L78)

Semi-extensões da forma em espaço local (antes de qualquer transformação).
Usado pelo SATAlgorithm para extrair dimensões do OBB sem depender do tipo concreto.
Caixas: [halfWidth, halfHeight, halfDepth].

#### Returns

\[`number`, `number`, `number`\]

#### Inherited from

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

### getWorldVertices()?

> `optional` **getWorldVertices**(`worldMatrix`): `vec3`[]

Defined in: [scene/components/physics/Collider.ts:71](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/scene/components/physics/Collider.ts#L71)

Vértices da forma em espaço de mundo — implementado por poliedros (BoxShape).
Usado pelo PlaneBoxCollision para manifold multi-ponto sem cast para tipo concreto.
Retorna array vazio por default; formas sem vértices explícitos não o implementam.

#### Parameters

##### worldMatrix

`mat4`

#### Returns

`vec3`[]

#### Inherited from

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
