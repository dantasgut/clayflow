[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / EdgeColoringVerdict

# Interface: EdgeColoringVerdict

Defined in: [elements/gpu/compute/GraphColorer.ts:33](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/gpu/compute/GraphColorer.ts#L33)

Resultado de `verifyEdgeColoring`.

## Properties

### colorCount

> `readonly` **colorCount**: `number`

Defined in: [elements/gpu/compute/GraphColorer.ts:37](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/gpu/compute/GraphColorer.ts#L37)

Maior cor + 1.

***

### conflict?

> `readonly` `optional` **conflict?**: readonly \[`number`, `number`\]

Defined in: [elements/gpu/compute/GraphColorer.ts:39](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/gpu/compute/GraphColorer.ts#L39)

Primeiro par de arestas em conflito (índices), quando inválida.

***

### valid

> `readonly` **valid**: `boolean`

Defined in: [elements/gpu/compute/GraphColorer.ts:35](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/gpu/compute/GraphColorer.ts#L35)

Nenhuma cor com duas arestas no mesmo vértice.
