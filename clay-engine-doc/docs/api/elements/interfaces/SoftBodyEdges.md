[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / SoftBodyEdges

# Interface: SoftBodyEdges

Defined in: [elements/physics/bodies/SoftBody.ts:30](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/bodies/SoftBody.ts#L30)

Restrições de distância internas de um corpo XPBD: pares de índices locais de partícula.

## Properties

### a

> `readonly` **a**: `ArrayLike`\<`number`\>

Defined in: [elements/physics/bodies/SoftBody.ts:32](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/bodies/SoftBody.ts#L32)

Primeira partícula de cada aresta (índice local, `< N`).

***

### b

> `readonly` **b**: `ArrayLike`\<`number`\>

Defined in: [elements/physics/bodies/SoftBody.ts:34](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/bodies/SoftBody.ts#L34)

Segunda partícula de cada aresta (índice local, `< N`).

***

### compliance?

> `readonly` `optional` **compliance?**: `number` \| `ArrayLike`\<`number`\>

Defined in: [elements/physics/bodies/SoftBody.ts:38](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/bodies/SoftBody.ts#L38)

Compliance de cada aresta (m/N; 0 = rígida), ou um valor para todas. Default 0.

***

### restLength?

> `readonly` `optional` **restLength?**: `ArrayLike`\<`number`\>

Defined in: [elements/physics/bodies/SoftBody.ts:36](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/bodies/SoftBody.ts#L36)

Comprimento de repouso de cada aresta (m). Default: a distância inicial entre as duas partículas.
