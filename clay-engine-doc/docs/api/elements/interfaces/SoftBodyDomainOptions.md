[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / SoftBodyDomainOptions

# Interface: SoftBodyDomainOptions

Defined in: [elements/physics/bodies/SoftBody.ts:20](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/elements/physics/bodies/SoftBody.ts#L20)

Opções de domínio do SoftBody — uma partícula deformável (um nó do corpo;
o corpo completo é composto por N partículas + constraints). O algoritmo
seleciona o schema; `pos.w` carrega o inverso da massa.

## Properties

### algorithm

> `readonly` **algorithm**: [`SoftBodyAlgorithm`](../type-aliases/SoftBodyAlgorithm.md)

Defined in: [elements/physics/bodies/SoftBody.ts:22](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/elements/physics/bodies/SoftBody.ts#L22)

Seleciona o schema/flow integrador (XPBD ou FEM).

***

### mass?

> `readonly` `optional` **mass?**: `number`

Defined in: [elements/physics/bodies/SoftBody.ts:26](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/elements/physics/bodies/SoftBody.ts#L26)

Massa da partícula (kg). 0/ausente ⇒ fixa (inv_mass = 0).

***

### position?

> `readonly` `optional` **position?**: readonly \[`number`, `number`, `number`\]

Defined in: [elements/physics/bodies/SoftBody.ts:24](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/elements/physics/bodies/SoftBody.ts#L24)

Posição inicial da partícula (mundo). Default [0,0,0].
