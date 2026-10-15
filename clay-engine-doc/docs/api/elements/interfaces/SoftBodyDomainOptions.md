[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / SoftBodyDomainOptions

# Interface: SoftBodyDomainOptions

Defined in: [elements/physics/bodies/SoftBody.ts:45](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/bodies/SoftBody.ts#L45)

Opções de domínio do SoftBody — o corpo inteiro: N partículas em arrays e, no XPBD, as restrições de distância
internas. `pos.w` carrega o inverso da massa.

## Properties

### algorithm

> `readonly` **algorithm**: [`SoftBodyAlgorithm`](../type-aliases/SoftBodyAlgorithm.md)

Defined in: [elements/physics/bodies/SoftBody.ts:50](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/bodies/SoftBody.ts#L50)

Seleciona o schema e o estágio que simula: XPBD, FEM ou MPM (sólido elástico; massa, volume e rigidez vêm do
`ParticleMaterial` da cena).

***

### edges?

> `readonly` `optional` **edges?**: [`SoftBodyEdges`](SoftBodyEdges.md)

Defined in: [elements/physics/bodies/SoftBody.ts:56](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/bodies/SoftBody.ts#L56)

Restrições de distância internas (só XPBD), resolvidas na faixa do próprio corpo.

***

### mass?

> `readonly` `optional` **mass?**: `number` \| `ArrayLike`\<`number`\>

Defined in: [elements/physics/bodies/SoftBody.ts:54](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/bodies/SoftBody.ts#L54)

Massa de cada partícula (kg), ou uma para todas. 0 ⇒ fixa (inv_mass = 0). Default 0. Ignorada no MPM.

***

### position

> `readonly` **position**: [`ParticlePositions`](../type-aliases/ParticlePositions.md)

Defined in: [elements/physics/bodies/SoftBody.ts:52](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/bodies/SoftBody.ts#L52)

Posições iniciais (mundo): `x, y, z` por partícula; o tamanho define N.

***

### surface?

> `readonly` `optional` **surface?**: [`SoftBodySurface`](SoftBodySurface.md)

Defined in: [elements/physics/bodies/SoftBody.ts:62](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/bodies/SoftBody.ts#L62)

Superfície desenhada como malha (spec 008): triângulos sobre as partículas (índices locais) e uvs opcionais. Cria
uma `SurfaceGeometry` como parte do corpo, cujos vértices um estágio recalcula na GPU a cada quadro; com um
material de superfície e um `Transform` na entidade, o corpo é desenhado (e projeta sombra) como malha.
