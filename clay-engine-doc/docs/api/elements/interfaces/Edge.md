[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / Edge

# Interface: Edge

Defined in: [elements/gpu/GraphColorSolver.ts:7](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/gpu/GraphColorSolver.ts#L7)

Aresta entre dois vértices em um grafo de constraints. Usada pelo
`GraphColorSolver` para colorir constraints de física que devem ser
resolvidas em paralelo (constraints adjacentes ao mesmo vértice
conflitam e devem ter cores diferentes).

## Properties

### a

> `readonly` **a**: `number`

Defined in: [elements/gpu/GraphColorSolver.ts:9](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/gpu/GraphColorSolver.ts#L9)

Primeiro vértice da aresta (índice em algum pool de partículas).

***

### b

> `readonly` **b**: `number`

Defined in: [elements/gpu/GraphColorSolver.ts:11](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/elements/gpu/GraphColorSolver.ts#L11)

Segundo vértice da aresta.
