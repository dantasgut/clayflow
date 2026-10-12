[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / RigidBodyDomainOptions

# Type Alias: RigidBodyDomainOptions

> **RigidBodyDomainOptions** = [`RigidBodyShape`](RigidBodyShape.md) & `object`

Defined in: [elements/physics/bodies/RigidBody.ts:33](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/physics/bodies/RigidBody.ts#L33)

Opções de domínio do RigidBody dinâmico — vocabulário de física (massa,
atrito, restituição, damping, forma). O layout do struct GPU (`pos.w` =
inv_mass, `mat_props`, `body_shape`, `I_inv`) é derivado internamente.

## Type Declaration

### angularDamping?

> `readonly` `optional` **angularDamping?**: `number`

Amortecimento angular por substep (default 0.05).

### friction?

> `readonly` `optional` **friction?**: `number`

Coeficiente de atrito (default 0.5).

### linearDamping?

> `readonly` `optional` **linearDamping?**: `number`

Amortecimento linear por substep (default 0.05).

### mass?

> `readonly` `optional` **mass?**: `number`

Massa em kg (> 0). 0 ou ausente ⇒ corpo cinemático (inv_mass = 0).

### position?

> `readonly` `optional` **position?**: readonly \[`number`, `number`, `number`\]

Posição inicial (mundo). Default [0,0,0].

### restitution?

> `readonly` `optional` **restitution?**: `number`

Restituição / "quique" (default 0.2).

### rollingFriction?

> `readonly` `optional` **rollingFriction?**: `number`

Resistência ao rolamento em metros (default 0): limita o impulso angular de contato a `rollingFriction × λn`,
freando esferas que rolam sobre superfícies.

### rotation?

> `readonly` `optional` **rotation?**: readonly \[`number`, `number`, `number`, `number`\]

Orientação inicial (quaternion xyzw). Default [0,0,0,1].
