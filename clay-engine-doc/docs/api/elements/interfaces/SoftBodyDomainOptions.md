[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / SoftBodyDomainOptions

# Interface: SoftBodyDomainOptions

Defined in: [elements/physics/bodies/SoftBody.ts:22](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/physics/bodies/SoftBody.ts#L22)

Opções de domínio do SoftBody — uma partícula deformável (um nó do corpo;
o corpo completo é composto por N partículas + constraints). O algoritmo
seleciona o schema; `pos.w` carrega o inverso da massa.

## Properties

### algorithm

> `readonly` **algorithm**: [`SoftBodyAlgorithm`](../type-aliases/SoftBodyAlgorithm.md)

Defined in: [elements/physics/bodies/SoftBody.ts:27](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/physics/bodies/SoftBody.ts#L27)

Seleciona o schema/flow integrador: XPBD, FEM ou MPM (sólido elástico; massa, volume e rigidez vêm do
`ParticleMaterial` da cena).

***

### mass?

> `readonly` `optional` **mass?**: `number`

Defined in: [elements/physics/bodies/SoftBody.ts:31](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/physics/bodies/SoftBody.ts#L31)

Massa da partícula (kg). 0/ausente ⇒ fixa (inv_mass = 0). Ignorada no MPM (massa do material).

***

### position?

> `readonly` `optional` **position?**: readonly \[`number`, `number`, `number`\]

Defined in: [elements/physics/bodies/SoftBody.ts:29](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/physics/bodies/SoftBody.ts#L29)

Posição inicial da partícula (mundo). Default [0,0,0].
