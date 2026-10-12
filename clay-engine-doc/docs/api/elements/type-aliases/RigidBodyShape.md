[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / RigidBodyShape

# Type Alias: RigidBodyShape

> **RigidBodyShape** = \{ `radius`: `number`; `shape`: `"sphere"`; \} \| \{ `halfExtents`: readonly \[`number`, `number`, `number`\]; `shape`: `"box"`; \}

Defined in: [elements/physics/bodies/RigidBody.ts:14](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/physics/bodies/RigidBody.ts#L14)

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
