[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / LCPFlowOptions

# Interface: LCPFlowOptions

Defined in: [elements/physics/flows/LCPFlow.ts:60](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/physics/flows/LCPFlow.ts#L60)

Opções do `LCPFlow`.

## Properties

### bodiesPoolKey?

> `readonly` `optional` **bodiesPoolKey?**: `string`

Defined in: [elements/physics/flows/LCPFlow.ts:62](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/physics/flows/LCPFlow.ts#L62)

Pool dos corpos rígidos (default `'LCPSchema'`).

***

### maxContactsPerBody?

> `readonly` `optional` **maxContactsPerBody?**: `number`

Defined in: [elements/physics/flows/LCPFlow.ts:73](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/physics/flows/LCPFlow.ts#L73)

Contatos por corpo na capacidade da lista compactada (default 32; uma caixa apoiada gera um contato por canto).
Capacidade = `min(corpos × colliders × 8, corpos × maxContactsPerBody, limite de binding do device / 96)`;
contatos acima dela
são contados e avisados.

***

### solveIters?

> `readonly` `optional` **solveIters?**: `number`

Defined in: [elements/physics/flows/LCPFlow.ts:66](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/physics/flows/LCPFlow.ts#L66)

Iterações do solve (Jacobi com divisão de massa) por substep (default 8).

***

### substeps?

> `readonly` `optional` **substeps?**: `number`

Defined in: [elements/physics/flows/LCPFlow.ts:64](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/physics/flows/LCPFlow.ts#L64)

Substeps de detecção + solve por passo de física (default 4). O passo vem do `Time` da cena.
