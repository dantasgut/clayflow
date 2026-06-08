[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / GraphColorSolver

# Class: GraphColorSolver

Defined in: [elements/gpu/GraphColorSolver.ts:27](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/gpu/GraphColorSolver.ts#L27)

GraphColorSolver — Greedy graph coloring para batch parallel
constraint solver em XPBD/PBD. Atribui a cada aresta uma "cor"
(inteiro ≥ 0) tal que arestas adjacentes (compartilhando vértice)
têm cores diferentes.

Constraints com mesma cor podem ser resolvidas em paralelo na GPU
(não há writes conflitantes em vértices). Algorithm Greedy:
O(E + V·max_color), serial CPU; max_color ≤ 1 + max degree.

Usado em construct phase de XPBD/FEM para gerar batches de constraints
paralelizáveis (cada cor = um dispatch separado).

## Constructors

### Constructor

> **new GraphColorSolver**(): `GraphColorSolver`

#### Returns

`GraphColorSolver`

## Methods

### color()

> `static` **color**(`edges`): `Uint32Array`

Defined in: [elements/gpu/GraphColorSolver.ts:32](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/gpu/GraphColorSolver.ts#L32)

Atribui cores às arestas para batch parallel solve. Returns
Uint32Array onde `result[i]` é a cor (inteiro ≥ 0) da aresta `edges[i]`.

#### Parameters

##### edges

readonly [`Edge`](../interfaces/Edge.md)[]

#### Returns

`Uint32Array`

***

### maxColor()

> `static` **maxColor**(`colors`): `number`

Defined in: [elements/gpu/GraphColorSolver.ts:55](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/elements/gpu/GraphColorSolver.ts#L55)

Retorna o número total de cores usadas (= max color + 1). O solver
dispatcha N passes (1 por cor) para resolver todos os constraints.

#### Parameters

##### colors

`Uint32Array`

#### Returns

`number`
