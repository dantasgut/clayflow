[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / LCPFlowOptions

# Interface: LCPFlowOptions

Defined in: [elements/physics/flows/LCPFlow.ts:122](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/flows/LCPFlow.ts#L122)

Opções do `LCPFlow`.

## Properties

### maxContactsPerBody?

> `readonly` `optional` **maxContactsPerBody?**: `number`

Defined in: [elements/physics/flows/LCPFlow.ts:132](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/flows/LCPFlow.ts#L132)

Contatos por corpo na capacidade da lista compactada (padrão 32; uma caixa apoiada gera um contato por canto).
Capacidade = `min(corpos × colliders × 8, corpos × maxContactsPerBody, limite de binding do device / 96)`;
contatos acima dela são contados e avisados.

***

### maxPairsPerBody?

> `readonly` `optional` **maxPairsPerBody?**: `number`

Defined in: [elements/physics/flows/LCPFlow.ts:137](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/flows/LCPFlow.ts#L137)

Pares candidatos da broadphase por corpo e por forma (padrão 64): capacidade de cada lista = corpos ×
`maxPairsPerBody`; pares acima dela são contados e avisados (sem contato perdido em silêncio).

***

### solveIters?

> `readonly` `optional` **solveIters?**: `number`

Defined in: [elements/physics/flows/LCPFlow.ts:126](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/flows/LCPFlow.ts#L126)

Iterações do solve (Jacobi com divisão de massa) por substep (padrão 8).

***

### substeps?

> `readonly` `optional` **substeps?**: `number`

Defined in: [elements/physics/flows/LCPFlow.ts:124](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/flows/LCPFlow.ts#L124)

Substeps de detecção + solve por passo de física (padrão 4). O passo vem do `Time` da cena.
