[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / LCPFlowOptions

# Interface: LCPFlowOptions

Defined in: [elements/physics/flows/LCPFlow.ts:110](https://github.com/dantasgut/clayflow/blob/1e865e5867462e68c307a6f63f28da7ac030edf9/src/elements/physics/flows/LCPFlow.ts#L110)

Opções do `LCPFlow`.

## Properties

### bodiesPoolKey?

> `readonly` `optional` **bodiesPoolKey?**: `string`

Defined in: [elements/physics/flows/LCPFlow.ts:112](https://github.com/dantasgut/clayflow/blob/1e865e5867462e68c307a6f63f28da7ac030edf9/src/elements/physics/flows/LCPFlow.ts#L112)

Pool dos corpos rígidos (default `'LCPSchema'`).

***

### solveIters?

> `readonly` `optional` **solveIters?**: `number`

Defined in: [elements/physics/flows/LCPFlow.ts:116](https://github.com/dantasgut/clayflow/blob/1e865e5867462e68c307a6f63f28da7ac030edf9/src/elements/physics/flows/LCPFlow.ts#L116)

Iterações de Gauss-Seidel do solve por substep (default 8).

***

### substeps?

> `readonly` `optional` **substeps?**: `number`

Defined in: [elements/physics/flows/LCPFlow.ts:114](https://github.com/dantasgut/clayflow/blob/1e865e5867462e68c307a6f63f28da7ac030edf9/src/elements/physics/flows/LCPFlow.ts#L114)

Substeps de detecção + solve por passo de física (default 4). O passo vem do `Time` da cena.
