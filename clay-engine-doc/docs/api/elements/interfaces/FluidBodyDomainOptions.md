[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / FluidBodyDomainOptions

# Interface: FluidBodyDomainOptions

Defined in: [elements/physics/bodies/FluidBody.ts:24](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/physics/bodies/FluidBody.ts#L24)

Opções de domínio do FluidBody — uma partícula de fluido (o fluido completo
é N partículas no mesmo pool). O algoritmo seleciona o schema. Observação:
`pos.w` é específico do algoritmo (densidade no SPH, lambda no PBF) e NÃO é
massa — por isso só `pos.xyz` e `vel.xyz` são definidos aqui.

## Properties

### algorithm

> `readonly` **algorithm**: [`FluidAlgorithm`](../type-aliases/FluidAlgorithm.md)

Defined in: [elements/physics/bodies/FluidBody.ts:26](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/physics/bodies/FluidBody.ts#L26)

Seleciona o schema/flow integrador (SPH, PBF ou MPM).

***

### position?

> `readonly` `optional` **position?**: readonly \[`number`, `number`, `number`\]

Defined in: [elements/physics/bodies/FluidBody.ts:28](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/physics/bodies/FluidBody.ts#L28)

Posição inicial da partícula (mundo). Default [0,0,0].

***

### velocity?

> `readonly` `optional` **velocity?**: readonly \[`number`, `number`, `number`\]

Defined in: [elements/physics/bodies/FluidBody.ts:30](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/physics/bodies/FluidBody.ts#L30)

Velocidade inicial da partícula. Default [0,0,0].
