[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / LCPFlowOptions

# Interface: LCPFlowOptions

Defined in: [elements/physics/flows/LCPFlow.ts:115](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/physics/flows/LCPFlow.ts#L115)

Opções do `LCPFlow`.

## Properties

### maxContactsPerBody?

> `readonly` `optional` **maxContactsPerBody?**: `number`

Defined in: [elements/physics/flows/LCPFlow.ts:125](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/physics/flows/LCPFlow.ts#L125)

Contatos por corpo na capacidade da lista compactada (padrão 32; uma caixa apoiada gera um contato por canto).
Capacidade = `min(corpos × colliders × 8, corpos × maxContactsPerBody, limite de binding do device / 96)`;
contatos acima dela são contados e avisados.

***

### maxPairsPerBody?

> `readonly` `optional` **maxPairsPerBody?**: `number`

Defined in: [elements/physics/flows/LCPFlow.ts:130](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/physics/flows/LCPFlow.ts#L130)

Pares candidatos da broadphase por corpo e por forma (padrão 64): capacidade de cada lista = corpos ×
`maxPairsPerBody`; pares acima dela são contados e avisados (sem contato perdido em silêncio).

***

### solveIters?

> `readonly` `optional` **solveIters?**: `number`

Defined in: [elements/physics/flows/LCPFlow.ts:119](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/physics/flows/LCPFlow.ts#L119)

Iterações do solve (Jacobi com divisão de massa) por substep (padrão 8).

***

### substeps?

> `readonly` `optional` **substeps?**: `number`

Defined in: [elements/physics/flows/LCPFlow.ts:117](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/physics/flows/LCPFlow.ts#L117)

Substeps de detecção + solve por passo de física (padrão 4). O passo vem do `Time` da cena.
