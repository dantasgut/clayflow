[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / FluidBodyDomainOptions

# Interface: FluidBodyDomainOptions

Defined in: [elements/physics/bodies/FluidBody.ts:23](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/physics/bodies/FluidBody.ts#L23)

Opções de domínio do FluidBody — uma partícula de fluido (o fluido completo
é N partículas no mesmo pool). O algoritmo seleciona o schema. Observação:
`pos.w` é específico do algoritmo (densidade no SPH, lambda no PBF) e NÃO é
massa — por isso só `pos.xyz` e `vel.xyz` são definidos aqui.

## Properties

### algorithm

> `readonly` **algorithm**: [`FluidAlgorithm`](../type-aliases/FluidAlgorithm.md)

Defined in: [elements/physics/bodies/FluidBody.ts:25](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/physics/bodies/FluidBody.ts#L25)

Seleciona o schema/flow integrador (SPH, PBF ou MPM).

***

### position?

> `readonly` `optional` **position?**: readonly \[`number`, `number`, `number`\]

Defined in: [elements/physics/bodies/FluidBody.ts:27](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/physics/bodies/FluidBody.ts#L27)

Posição inicial da partícula (mundo). Default [0,0,0].

***

### velocity?

> `readonly` `optional` **velocity?**: readonly \[`number`, `number`, `number`\]

Defined in: [elements/physics/bodies/FluidBody.ts:29](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/physics/bodies/FluidBody.ts#L29)

Velocidade inicial da partícula. Default [0,0,0].
