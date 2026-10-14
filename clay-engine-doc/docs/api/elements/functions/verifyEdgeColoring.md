[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / verifyEdgeColoring

# Function: verifyEdgeColoring()

> **verifyEdgeColoring**(`edges`, `colors`): [`EdgeColoringVerdict`](../interfaces/EdgeColoringVerdict.md)

Defined in: [elements/gpu/compute/GraphColorer.ts:131](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/gpu/compute/GraphColorer.ts#L131)

Verifica uma coloração de arestas: nenhuma cor com duas arestas no mesmo vértice. `edges` são pares `(a, b)`
achatados. Usada pelos testes e pelo smoke `computeKernels`.

## Parameters

### edges

`Uint32Array`

### colors

`Uint32Array`

## Returns

[`EdgeColoringVerdict`](../interfaces/EdgeColoringVerdict.md)
