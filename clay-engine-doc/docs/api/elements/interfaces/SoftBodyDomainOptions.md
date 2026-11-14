[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / SoftBodyDomainOptions

# Interface: SoftBodyDomainOptions

Defined in: [src/elements/physics/bodies/SoftBody.ts:61](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/bodies/SoftBody.ts#L61)

Opções de domínio do SoftBody — o corpo inteiro: N partículas em arrays e, no XPBD, as restrições de distância
internas. `pos.w` carrega o inverso da massa.

## Properties

### algorithm

> `readonly` **algorithm**: [`SoftBodyAlgorithm`](../type-aliases/SoftBodyAlgorithm.md)

Defined in: [src/elements/physics/bodies/SoftBody.ts:66](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/bodies/SoftBody.ts#L66)

Seleciona o schema e o estágio que simula: XPBD, FEM ou MPM (sólido elástico; massa, volume e rigidez vêm do
`ParticlePhysics` da cena).

***

### edges?

> `readonly` `optional` **edges?**: [`SoftBodyEdges`](SoftBodyEdges.md)

Defined in: [src/elements/physics/bodies/SoftBody.ts:72](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/bodies/SoftBody.ts#L72)

Restrições de distância internas (só XPBD), resolvidas na faixa do próprio corpo.

***

### mass?

> `readonly` `optional` **mass?**: `number` \| `ArrayLike`\<`number`\>

Defined in: [src/elements/physics/bodies/SoftBody.ts:70](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/bodies/SoftBody.ts#L70)

Massa de cada partícula (kg), ou uma para todas. 0 ⇒ fixa (inv_mass = 0). Default 0. Ignorada no MPM.

***

### position

> `readonly` **position**: [`ParticlePositions`](../type-aliases/ParticlePositions.md)

Defined in: [src/elements/physics/bodies/SoftBody.ts:68](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/bodies/SoftBody.ts#L68)

Posições iniciais (mundo): `x, y, z` por partícula; o tamanho define N.

***

### surface?

> `readonly` `optional` **surface?**: [`SoftBodySurface`](SoftBodySurface.md)

Defined in: [src/elements/physics/bodies/SoftBody.ts:78](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/bodies/SoftBody.ts#L78)

Superfície desenhada como malha (spec 008): triângulos sobre as partículas (índices locais) e uvs opcionais. Cria
uma `SurfaceGeometry` como parte do corpo, cujos vértices um estágio recalcula na GPU a cada quadro; com um
material de superfície e um `Transform` na entidade, o corpo é desenhado (e projeta sombra) como malha.
