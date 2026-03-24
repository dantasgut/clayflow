# Class: PlaneShape

Defined in: [elements/physics/shapes/PlaneShape.ts:16](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/elements/physics/shapes/PlaneShape.ts#L16)

Forma de colisão de plano finito ou infinito. (Camada 3)

SDF: p · n - d  (semiespaço definido por normal n e deslocamento d)
Por padrão: plano XZ com normal +Y.

halfWidth e halfDepth definem os limites do plano em X e Z (espaço local).
Os algoritmos de colisão (PlaneSphereCollision, PlaneBoxCollision) rejeitam
contatos fora desses limites — objetos que saem da borda caem no vazio.

## Example

```ts
new PlaneShape([0, 1, 0], 0, 6, 6); // plano 12×12 (±6 em X e Z)
```

## Extends

- [`SDFCollider`](SDFCollider.md)

## Constructors

### Constructor

> **new PlaneShape**(`normal?`, `offset?`, `halfWidth?`, `halfDepth?`): `PlaneShape`

Defined in: [elements/physics/shapes/PlaneShape.ts:27](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/elements/physics/shapes/PlaneShape.ts#L27)

#### Parameters

##### normal?

\[`number`, `number`, `number`\] = `...`

##### offset?

`number` = `0`

##### halfWidth?

`number` = `Infinity`

##### halfDepth?

`number` = `Infinity`

#### Returns

`PlaneShape`

#### Overrides

[`SDFCollider`](SDFCollider.md).[`constructor`](SDFCollider.md#constructor)

## Properties

### boundingRadiusVal

> `protected` `readonly` **boundingRadiusVal**: `number`

Defined in: [elements/physics/shapes/SDFCollider.ts:54](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/elements/physics/shapes/SDFCollider.ts#L54)

#### Inherited from

[`SDFCollider`](SDFCollider.md).[`boundingRadiusVal`](SDFCollider.md#boundingradiusval)

***

### colliderShape

> `readonly` **colliderShape**: `string`

Defined in: [elements/physics/shapes/SDFCollider.ts:51](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/elements/physics/shapes/SDFCollider.ts#L51)

Identificador da forma, usado pelo CollisionDispatcher para selecionar o teste.

#### Inherited from

[`SDFCollider`](SDFCollider.md).[`colliderShape`](SDFCollider.md#collidershape)

***

### halfDepth

> `readonly` **halfDepth**: `number`

Defined in: [elements/physics/shapes/PlaneShape.ts:20](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/elements/physics/shapes/PlaneShape.ts#L20)

Metade da profundidade em Z (espaço local). Infinity = sem limite.

***

### halfWidth

> `readonly` **halfWidth**: `number`

Defined in: [elements/physics/shapes/PlaneShape.ts:18](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/elements/physics/shapes/PlaneShape.ts#L18)

Metade da largura em X (espaço local). Infinity = sem limite.

***

### layer

> `readonly` **layer**: [`PHYSICS_MECHANIC`](../enumerations/ResourceType.md#physics_mechanic)

Defined in: [scene/components/physics/Collider.ts:31](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/physics/Collider.ts#L31)

#### Inherited from

[`SDFCollider`](SDFCollider.md).[`layer`](SDFCollider.md#layer)

***

### normal

> `readonly` **normal**: readonly \[`number`, `number`, `number`\]

Defined in: [elements/physics/shapes/PlaneShape.ts:23](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/elements/physics/shapes/PlaneShape.ts#L23)

Normal do plano no espaço do mundo (normalizada).

***

### offset

> `readonly` **offset**: `number`

Defined in: [elements/physics/shapes/PlaneShape.ts:25](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/elements/physics/shapes/PlaneShape.ts#L25)

Deslocamento ao longo da normal: p·n = offset define a superfície.

***

### physicType

> `readonly` **physicType**: `"Collider"` = `'Collider'`

Defined in: [scene/components/physics/Collider.ts:32](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/physics/Collider.ts#L32)

#### Inherited from

[`SDFCollider`](SDFCollider.md).[`physicType`](SDFCollider.md#physictype)

***

### type

> `readonly` **type**: `"Collider"` = `'Collider'`

Defined in: [scene/components/physics/Collider.ts:30](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/physics/Collider.ts#L30)

Chave única no layer 1 — garante um único Collider por Entity.

#### Inherited from

[`SDFCollider`](SDFCollider.md).[`type`](SDFCollider.md#type)

## Methods

### computeInertiaTensor()

> **computeInertiaTensor**(`mass`): \[`number`, `number`, `number`\]

Defined in: [elements/physics/shapes/SDFCollider.ts:70](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/elements/physics/shapes/SDFCollider.ts#L70)

Tensor de inércia diagonal para esta forma, dado uma massa.

#### Parameters

##### mass

`number`

#### Returns

\[`number`, `number`, `number`\]

#### Inherited from

[`SDFCollider`](SDFCollider.md).[`computeInertiaTensor`](SDFCollider.md#computeinertiatensor)

***

### getAABB()

> **getAABB**(`worldMatrix`): `AABB`

Defined in: [elements/physics/shapes/SDFCollider.ts:109](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/elements/physics/shapes/SDFCollider.ts#L109)

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

Defined in: [elements/physics/shapes/SDFCollider.ts:84](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/elements/physics/shapes/SDFCollider.ts#L84)

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

Defined in: [elements/physics/shapes/SDFCollider.ts:92](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/elements/physics/shapes/SDFCollider.ts#L92)

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

Defined in: [scene/components/physics/Collider.ts:78](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/physics/Collider.ts#L78)

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

Defined in: [elements/physics/shapes/SDFCollider.ts:80](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/elements/physics/shapes/SDFCollider.ts#L80)

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

Defined in: [scene/components/physics/Collider.ts:71](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/physics/Collider.ts#L71)

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

Defined in: [elements/physics/shapes/SDFCollider.ts:76](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/elements/physics/shapes/SDFCollider.ts#L76)

SDF em espaço local — disponível para testes narrowphase customizados.

#### Parameters

##### localPoint

`vec3`

#### Returns

`number`

#### Inherited from

[`SDFCollider`](SDFCollider.md).[`sdf`](SDFCollider.md#sdf)
