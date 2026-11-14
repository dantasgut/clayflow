[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / FluidBodyDomainOptions

# Interface: FluidBodyDomainOptions

Defined in: [src/elements/physics/bodies/FluidBody.ts:33](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/bodies/FluidBody.ts#L33)

Opções de domínio do FluidBody — o fluido inteiro: N partículas em arrays. O algoritmo seleciona o schema. `pos.w` é
do algoritmo (densidade no SPH, lambda no PBF) e não é massa — massa e volume vêm do `ParticlePhysics` da cena.

## Properties

### algorithm

> `readonly` **algorithm**: [`FluidAlgorithm`](../type-aliases/FluidAlgorithm.md)

Defined in: [src/elements/physics/bodies/FluidBody.ts:35](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/bodies/FluidBody.ts#L35)

Seleciona o schema e o estágio que simula (SPH, PBF ou MPM).

***

### position

> `readonly` **position**: [`ParticlePositions`](../type-aliases/ParticlePositions.md)

Defined in: [src/elements/physics/bodies/FluidBody.ts:37](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/bodies/FluidBody.ts#L37)

Posições iniciais (mundo): `x, y, z` por partícula; o tamanho define N.

***

### velocity?

> `readonly` `optional` **velocity?**: `ArrayLike`\<`number`\>

Defined in: [src/elements/physics/bodies/FluidBody.ts:39](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/bodies/FluidBody.ts#L39)

Velocidades iniciais: `x, y, z` por partícula. Default zero.
