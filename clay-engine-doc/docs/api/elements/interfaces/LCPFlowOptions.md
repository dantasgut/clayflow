[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / LCPFlowOptions

# Interface: LCPFlowOptions

Defined in: [elements/physics/flows/LCPFlow.ts:135](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/elements/physics/flows/LCPFlow.ts#L135)

Opções do `LCPFlow`.

## Properties

### bodiesPoolKey?

> `readonly` `optional` **bodiesPoolKey?**: `string`

Defined in: [elements/physics/flows/LCPFlow.ts:137](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/elements/physics/flows/LCPFlow.ts#L137)

Pool dos corpos rígidos (default `'LCPSchema'`).

***

### maxContactsPerBody?

> `readonly` `optional` **maxContactsPerBody?**: `number`

Defined in: [elements/physics/flows/LCPFlow.ts:148](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/elements/physics/flows/LCPFlow.ts#L148)

Contatos por corpo na capacidade da lista compactada (default 32; uma caixa apoiada gera um contato por canto).
Capacidade = `min(corpos × colliders × 8, corpos × maxContactsPerBody, limite de binding do device / 96)`;
contatos acima dela
são contados e avisados.

***

### solveIters?

> `readonly` `optional` **solveIters?**: `number`

Defined in: [elements/physics/flows/LCPFlow.ts:141](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/elements/physics/flows/LCPFlow.ts#L141)

Iterações do solve (Jacobi com divisão de massa) por substep (default 8).

***

### substeps?

> `readonly` `optional` **substeps?**: `number`

Defined in: [elements/physics/flows/LCPFlow.ts:139](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/elements/physics/flows/LCPFlow.ts#L139)

Substeps de detecção + solve por passo de física (default 4). O passo vem do `Time` da cena.
