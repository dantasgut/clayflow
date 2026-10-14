[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / RigidBodyShape

# Type Alias: RigidBodyShape

> **RigidBodyShape** = \{ `radius`: `number`; `shape`: `"sphere"`; \} \| \{ `halfExtents`: readonly \[`number`, `number`, `number`\]; `shape`: `"box"`; \}

Defined in: [elements/physics/bodies/RigidBody.ts:14](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/physics/bodies/RigidBody.ts#L14)

Forma associada a um RigidBody dinâmico, em vocabulário de domínio.
`sphere` → raio; `box` → half-extents. Determina `body_shape` (struct GPU)
e o colisor anexado automaticamente.

## Union Members

### Type Literal

\{ `radius`: `number`; `shape`: `"sphere"`; \}

#### radius

> `readonly` **radius**: `number`

Raio em metros.

#### shape

> `readonly` **shape**: `"sphere"`

Esfera.

***

### Type Literal

\{ `halfExtents`: readonly \[`number`, `number`, `number`\]; `shape`: `"box"`; \}

#### halfExtents

> `readonly` **halfExtents**: readonly \[`number`, `number`, `number`\]

Meias-extensões em metros (x, y, z).

#### shape

> `readonly` **shape**: `"box"`

Caixa.
