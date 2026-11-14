[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / SoftBodyEdges

# Interface: SoftBodyEdges

Defined in: [src/elements/physics/bodies/SoftBody.ts:46](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/bodies/SoftBody.ts#L46)

Restrições de distância internas de um corpo XPBD: pares de índices locais de partícula.

## Properties

### a

> `readonly` **a**: `ArrayLike`\<`number`\>

Defined in: [src/elements/physics/bodies/SoftBody.ts:48](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/bodies/SoftBody.ts#L48)

Primeira partícula de cada aresta (índice local, `< N`).

***

### b

> `readonly` **b**: `ArrayLike`\<`number`\>

Defined in: [src/elements/physics/bodies/SoftBody.ts:50](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/bodies/SoftBody.ts#L50)

Segunda partícula de cada aresta (índice local, `< N`).

***

### compliance?

> `readonly` `optional` **compliance?**: `number` \| `ArrayLike`\<`number`\>

Defined in: [src/elements/physics/bodies/SoftBody.ts:54](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/bodies/SoftBody.ts#L54)

Compliance de cada aresta (m/N; 0 = rígida), ou um valor para todas. Default 0.

***

### restLength?

> `readonly` `optional` **restLength?**: `ArrayLike`\<`number`\>

Defined in: [src/elements/physics/bodies/SoftBody.ts:52](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/bodies/SoftBody.ts#L52)

Comprimento de repouso de cada aresta (m). Default: a distância inicial entre as duas partículas.
