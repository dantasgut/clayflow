[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / RigidBodyShape

# Type Alias: RigidBodyShape

> **RigidBodyShape** = \{ `radius`: `number`; `shape`: `"sphere"`; \} \| \{ `halfExtents`: readonly \[`number`, `number`, `number`\]; `shape`: `"box"`; \}

Defined in: [elements/physics/bodies/RigidBody.ts:14](https://github.com/dantasgut/clayflow/blob/204f2e93c5ebaf2f2b7e257814d24c704d7cf3e6/src/elements/physics/bodies/RigidBody.ts#L14)

Forma associada a um RigidBody dinâmico, em vocabulário de domínio.
`sphere` → raio; `box` → half-extents. Determina `body_shape` (struct GPU)
e o colisor anexado automaticamente.
