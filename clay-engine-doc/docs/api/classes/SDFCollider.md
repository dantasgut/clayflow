# Class: SDFCollider

Defined in: [elements/physics/shapes/SDFCollider.ts:50](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/elements/physics/shapes/SDFCollider.ts#L50)

Collider definido por Signed Distance Function (SDF) arbitrária.

Permite descrever qualquer forma — esfera, toro, superfície de Riemann,
formas de geometria diferencial — sem subclasses, apenas com uma fórmula.

As primitivas geométricas (getClosestPoint, getBoundingRadius, getAABB)
são derivadas numericamente do SDF via diferenças finitas e gradient descent.

## Example

```ts
// Toro
mesh.add(new SDFCollider({
    sdf: (p) => { const q = Math.sqrt(p[0]**2+p[2]**2) - 1.0; return Math.sqrt(q**2+p[1]**2) - 0.3; },
    boundingRadius: 1.3,
    shape: 'Torus',
}));

// Superfície implícita customizada
mesh.add(new SDFCollider({
    sdf: (p) => p[0]**2 + p[1]**2 - p[2]**2 - 1, // hiperboloide
    boundingRadius: 2.0,
}));
```

## Extends

- [`Collider`](Collider.md)

## Extended by

- [`SphereShape`](SphereShape.md)
- [`BoxShape`](BoxShape.md)
- [`PlaneShape`](PlaneShape.md)

## Constructors

### Constructor

> **new SDFCollider**(`options`): `SDFCollider`

Defined in: [elements/physics/shapes/SDFCollider.ts:60](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/elements/physics/shapes/SDFCollider.ts#L60)

#### Parameters

##### options

`SDFColliderOptions`

#### Returns

`SDFCollider`

#### Overrides

[`Collider`](Collider.md).[`constructor`](Collider.md#constructor)

## Properties

### boundingRadiusVal

> `protected` `readonly` **boundingRadiusVal**: `number`

Defined in: [elements/physics/shapes/SDFCollider.ts:54](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/elements/physics/shapes/SDFCollider.ts#L54)

***

### colliderShape

> `readonly` **colliderShape**: `string`

Defined in: [elements/physics/shapes/SDFCollider.ts:51](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/elements/physics/shapes/SDFCollider.ts#L51)

Identificador canônico da forma (ex: 'sphere', 'box', 'plane').

#### Overrides

[`Collider`](Collider.md).[`colliderShape`](Collider.md#collidershape)

***

### layer

> `readonly` **layer**: [`PHYSICS_MECHANIC`](../enumerations/ResourceType.md#physics_mechanic)

Defined in: [scene/components/physics/Collider.ts:31](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/physics/Collider.ts#L31)

#### Inherited from

[`Collider`](Collider.md).[`layer`](Collider.md#layer)

***

### physicType

> `readonly` **physicType**: `"Collider"` = `'Collider'`

Defined in: [scene/components/physics/Collider.ts:32](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/physics/Collider.ts#L32)

#### Inherited from

[`Collider`](Collider.md).[`physicType`](Collider.md#physictype)

***

### type

> `readonly` **type**: `"Collider"` = `'Collider'`

Defined in: [scene/components/physics/Collider.ts:30](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/physics/Collider.ts#L30)

Chave única no layer 1 — garante um único Collider por Entity.

#### Inherited from

[`Collider`](Collider.md).[`type`](Collider.md#type)

## Methods

### computeInertiaTensor()

> **computeInertiaTensor**(`mass`): \[`number`, `number`, `number`\]

Defined in: [elements/physics/shapes/SDFCollider.ts:70](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/elements/physics/shapes/SDFCollider.ts#L70)

Tensor de inércia diagonal para esta forma, dado uma massa.

#### Parameters

##### mass

`number`

#### Returns

\[`number`, `number`, `number`\]

#### Overrides

[`Collider`](Collider.md).[`computeInertiaTensor`](Collider.md#computeinertiatensor)

***

### getAABB()

> **getAABB**(`worldMatrix`): `AABB`

Defined in: [elements/physics/shapes/SDFCollider.ts:117](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/elements/physics/shapes/SDFCollider.ts#L117)

AABB conservador derivado da esfera circunscrita.

#### Parameters

##### worldMatrix

`mat4`

#### Returns

`AABB`

#### Overrides

[`Collider`](Collider.md).[`getAABB`](Collider.md#getaabb)

***

### getBoundingRadius()

> **getBoundingRadius**(`worldMatrix`): `number`

Defined in: [elements/physics/shapes/SDFCollider.ts:92](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/elements/physics/shapes/SDFCollider.ts#L92)

Raio da esfera circunscrita no espaço de mundo.
Esferas: radius * maxScale.
Boxes: comprimento da diagonal de halfExtents * maxScale.

#### Parameters

##### worldMatrix

`mat4`

#### Returns

`number`

#### Overrides

[`Collider`](Collider.md).[`getBoundingRadius`](Collider.md#getboundingradius)

***

### getClosestPoint()

> **getClosestPoint**(`worldMatrix`, `queryPoint`): `vec3`

Defined in: [elements/physics/shapes/SDFCollider.ts:100](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/elements/physics/shapes/SDFCollider.ts#L100)

Ponto mais próximo na superfície via gradient descent no SDF.
Projeta o queryPoint (mundo) para a superfície da forma.

#### Parameters

##### worldMatrix

`mat4`

##### queryPoint

`vec3`

#### Returns

`vec3`

#### Overrides

[`Collider`](Collider.md).[`getClosestPoint`](Collider.md#getclosestpoint)

***

### getLocalHalfExtents()?

> `optional` **getLocalHalfExtents**(): \[`number`, `number`, `number`\]

Defined in: [scene/components/physics/Collider.ts:78](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/scene/components/physics/Collider.ts#L78)

Semi-extensões da forma em espaço local (antes de qualquer transformação).
Usado pelo SATAlgorithm para extrair dimensões do OBB sem depender do tipo concreto.
Caixas: [halfWidth, halfHeight, halfDepth].

#### Returns

\[`number`, `number`, `number`\]

#### Inherited from

[`Collider`](Collider.md).[`getLocalHalfExtents`](Collider.md#getlocalhalfextents)

***

### getWorldCenter()

> **getWorldCenter**(`worldMatrix`): `vec3`

Defined in: [elements/physics/shapes/SDFCollider.ts:88](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/elements/physics/shapes/SDFCollider.ts#L88)

Centro do volume no espaço de mundo.

#### Parameters

##### worldMatrix

`mat4`

#### Returns

`vec3`

#### Overrides

[`Collider`](Collider.md).[`getWorldCenter`](Collider.md#getworldcenter)

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

#### Inherited from

[`Collider`](Collider.md).[`getWorldVertices`](Collider.md#getworldvertices)

***

### packDescriptor()

> **packDescriptor**(): `object`

Defined in: [elements/physics/shapes/SDFCollider.ts:79](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/elements/physics/shapes/SDFCollider.ts#L79)

Fallback para formas SDF arbitrárias — descreve uma esfera circunscrita (shapeType=0).
Formas concretas (SphereShape, BoxShape, PlaneShape) sobrescrevem com descritores exatos.

#### Returns

`object`

##### bounds

> **bounds**: \[`number`, `number`\]

##### half

> **half**: \[`number`, `number`, `number`, `number`\]

##### shapeType

> **shapeType**: `number`

#### Overrides

[`Collider`](Collider.md).[`packDescriptor`](Collider.md#packdescriptor)

***

### sdf()

> **sdf**(`localPoint`): `number`

Defined in: [elements/physics/shapes/SDFCollider.ts:84](https://github.com/dantasgut/clayflow/blob/87010aaa1cb17d2d45c3b81bbc0c9138a609607c/src/elements/physics/shapes/SDFCollider.ts#L84)

SDF em espaço local — disponível para testes narrowphase customizados.

#### Parameters

##### localPoint

`vec3`

#### Returns

`number`

#### Overrides

[`Collider`](Collider.md).[`sdf`](Collider.md#sdf)
