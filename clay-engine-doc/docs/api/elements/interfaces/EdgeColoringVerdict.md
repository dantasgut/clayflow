[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / EdgeColoringVerdict

# Interface: EdgeColoringVerdict

Defined in: [elements/gpu/compute/GraphColorer.ts:33](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/gpu/compute/GraphColorer.ts#L33)

Resultado de `verifyEdgeColoring`.

## Properties

### colorCount

> `readonly` **colorCount**: `number`

Defined in: [elements/gpu/compute/GraphColorer.ts:37](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/gpu/compute/GraphColorer.ts#L37)

Maior cor + 1.

***

### conflict?

> `readonly` `optional` **conflict?**: readonly \[`number`, `number`\]

Defined in: [elements/gpu/compute/GraphColorer.ts:39](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/gpu/compute/GraphColorer.ts#L39)

Primeiro par de arestas em conflito (índices), quando inválida.

***

### valid

> `readonly` **valid**: `boolean`

Defined in: [elements/gpu/compute/GraphColorer.ts:35](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/gpu/compute/GraphColorer.ts#L35)

Nenhuma cor com duas arestas no mesmo vértice.
