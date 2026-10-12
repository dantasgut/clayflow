[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / LCPFlowOptions

# Interface: LCPFlowOptions

Defined in: [elements/physics/flows/LCPFlow.ts:96](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/physics/flows/LCPFlow.ts#L96)

Opções do `LCPFlow`.

## Properties

### maxContactsPerBody?

> `readonly` `optional` **maxContactsPerBody?**: `number`

Defined in: [elements/physics/flows/LCPFlow.ts:106](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/physics/flows/LCPFlow.ts#L106)

Contatos por corpo na capacidade da lista compactada (padrão 32; uma caixa apoiada gera um contato por canto).
Capacidade = `min(corpos × colliders × 8, corpos × maxContactsPerBody, limite de binding do device / 96)`;
contatos acima dela são contados e avisados.

***

### solveIters?

> `readonly` `optional` **solveIters?**: `number`

Defined in: [elements/physics/flows/LCPFlow.ts:100](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/physics/flows/LCPFlow.ts#L100)

Iterações do solve (Jacobi com divisão de massa) por substep (padrão 8).

***

### substeps?

> `readonly` `optional` **substeps?**: `number`

Defined in: [elements/physics/flows/LCPFlow.ts:98](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/physics/flows/LCPFlow.ts#L98)

Substeps de detecção + solve por passo de física (padrão 4). O passo vem do `Time` da cena.
