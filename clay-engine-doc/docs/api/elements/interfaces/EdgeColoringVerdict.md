[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / EdgeColoringVerdict

# Interface: EdgeColoringVerdict

Defined in: [src/elements/gpu/compute/GraphColorer.ts:30](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/GraphColorer.ts#L30)

Resultado de `verifyEdgeColoring`.

## Properties

### colorCount

> `readonly` **colorCount**: `number`

Defined in: [src/elements/gpu/compute/GraphColorer.ts:34](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/GraphColorer.ts#L34)

Maior cor + 1.

***

### conflict?

> `readonly` `optional` **conflict?**: readonly \[`number`, `number`\]

Defined in: [src/elements/gpu/compute/GraphColorer.ts:36](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/GraphColorer.ts#L36)

Primeiro par de arestas em conflito (índices), quando inválida.

***

### valid

> `readonly` **valid**: `boolean`

Defined in: [src/elements/gpu/compute/GraphColorer.ts:32](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/gpu/compute/GraphColorer.ts#L32)

Nenhuma cor com duas arestas no mesmo vértice.
