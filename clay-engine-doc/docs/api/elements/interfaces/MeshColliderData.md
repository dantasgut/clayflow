[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / MeshColliderData

# Interface: MeshColliderData

Defined in: [elements/physics/colliders/MeshCollider.ts:7](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/physics/colliders/MeshCollider.ts#L7)

Dado de um `MeshCollider` (layout de `MeshCollider.schema` mais os triângulos, 9 floats cada).

## Properties

### \_pad0

> **\_pad0**: `number`

Defined in: [elements/physics/colliders/MeshCollider.ts:13](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/physics/colliders/MeshCollider.ts#L13)

Preenchimento do layout.

***

### \_pad1

> **\_pad1**: `number`

Defined in: [elements/physics/colliders/MeshCollider.ts:15](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/physics/colliders/MeshCollider.ts#L15)

Preenchimento do layout.

***

### firstTriangle

> **firstTriangle**: `number`

Defined in: [elements/physics/colliders/MeshCollider.ts:11](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/physics/colliders/MeshCollider.ts#L11)

Primeiro triângulo.

***

### triangleCount

> **triangleCount**: `number`

Defined in: [elements/physics/colliders/MeshCollider.ts:9](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/physics/colliders/MeshCollider.ts#L9)

Número de triângulos.

***

### triangles

> **triangles**: readonly `number`[]

Defined in: [elements/physics/colliders/MeshCollider.ts:17](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/physics/colliders/MeshCollider.ts#L17)

Triângulos (índices de vértice).
