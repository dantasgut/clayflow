[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / GraphColorerOptions

# Interface: GraphColorerOptions

Defined in: [elements/gpu/compute/GraphColorer.ts:57](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/gpu/compute/GraphColorer.ts#L57)

Opções de `GraphColorer`.

## Properties

### capacity

> `readonly` **capacity**: `number`

Defined in: [elements/gpu/compute/GraphColorer.ts:61](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/gpu/compute/GraphColorer.ts#L61)

Maior número de arestas aceito por `color`.

***

### discriminator

> `readonly` **discriminator**: `string`

Defined in: [elements/gpu/compute/GraphColorer.ts:59](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/gpu/compute/GraphColorer.ts#L59)

Prefixo único dos recursos da instância.

***

### maxColors?

> `readonly` `optional` **maxColors?**: `number`

Defined in: [elements/gpu/compute/GraphColorer.ts:63](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/gpu/compute/GraphColorer.ts#L63)

Teto de cores; padrão `2Δ` (Δ = grau máximo, calculado na GPU).
