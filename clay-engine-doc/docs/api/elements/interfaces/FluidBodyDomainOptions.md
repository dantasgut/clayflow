[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / FluidBodyDomainOptions

# Interface: FluidBodyDomainOptions

Defined in: [elements/physics/bodies/FluidBody.ts:31](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/bodies/FluidBody.ts#L31)

Opções de domínio do FluidBody — o fluido inteiro: N partículas em arrays. O algoritmo seleciona o schema. `pos.w` é
do algoritmo (densidade no SPH, lambda no PBF) e não é massa — massa e volume vêm do `ParticleMaterial` da cena.

## Properties

### algorithm

> `readonly` **algorithm**: [`FluidAlgorithm`](../type-aliases/FluidAlgorithm.md)

Defined in: [elements/physics/bodies/FluidBody.ts:33](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/bodies/FluidBody.ts#L33)

Seleciona o schema e o estágio que simula (SPH, PBF ou MPM).

***

### position

> `readonly` **position**: [`ParticlePositions`](../type-aliases/ParticlePositions.md)

Defined in: [elements/physics/bodies/FluidBody.ts:35](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/bodies/FluidBody.ts#L35)

Posições iniciais (mundo): `x, y, z` por partícula; o tamanho define N.

***

### velocity?

> `readonly` `optional` **velocity?**: `ArrayLike`\<`number`\>

Defined in: [elements/physics/bodies/FluidBody.ts:37](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/bodies/FluidBody.ts#L37)

Velocidades iniciais: `x, y, z` por partícula. Default zero.
