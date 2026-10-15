[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / EdgeColoringVerdict

# Interface: EdgeColoringVerdict

Defined in: [elements/gpu/compute/GraphColorer.ts:33](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/gpu/compute/GraphColorer.ts#L33)

Resultado de `verifyEdgeColoring`.

## Properties

### colorCount

> `readonly` **colorCount**: `number`

Defined in: [elements/gpu/compute/GraphColorer.ts:37](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/gpu/compute/GraphColorer.ts#L37)

Maior cor + 1.

***

### conflict?

> `readonly` `optional` **conflict?**: readonly \[`number`, `number`\]

Defined in: [elements/gpu/compute/GraphColorer.ts:39](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/gpu/compute/GraphColorer.ts#L39)

Primeiro par de arestas em conflito (índices), quando inválida.

***

### valid

> `readonly` **valid**: `boolean`

Defined in: [elements/gpu/compute/GraphColorer.ts:35](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/gpu/compute/GraphColorer.ts#L35)

Nenhuma cor com duas arestas no mesmo vértice.
