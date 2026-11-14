[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / LCPFlowOptions

# Interface: LCPFlowOptions

Defined in: [src/elements/physics/flows/LCPFlow.ts:135](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/LCPFlow.ts#L135)

Opções do `LCPFlow`.

## Properties

### maxContactsPerBody?

> `readonly` `optional` **maxContactsPerBody?**: `number`

Defined in: [src/elements/physics/flows/LCPFlow.ts:145](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/LCPFlow.ts#L145)

Contatos por corpo na capacidade da lista compactada (padrão 32; uma caixa apoiada gera um contato por canto).
Capacidade = `min(corpos × colliders × 8, corpos × maxContactsPerBody, limite de binding do device / 96)`;
contatos acima dela são contados e avisados.

***

### maxPairsPerBody?

> `readonly` `optional` **maxPairsPerBody?**: `number`

Defined in: [src/elements/physics/flows/LCPFlow.ts:150](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/LCPFlow.ts#L150)

Pares candidatos da broadphase por corpo e por forma (padrão 64): capacidade de cada lista = corpos ×
`maxPairsPerBody`; pares acima dela são contados e avisados (sem contato perdido em silêncio).

***

### solveIters?

> `readonly` `optional` **solveIters?**: `number`

Defined in: [src/elements/physics/flows/LCPFlow.ts:139](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/LCPFlow.ts#L139)

Iterações do solve (Jacobi com divisão de massa) por substep (padrão 8).

***

### substeps?

> `readonly` `optional` **substeps?**: `number`

Defined in: [src/elements/physics/flows/LCPFlow.ts:137](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/LCPFlow.ts#L137)

Substeps de detecção + solve por passo de física (padrão 4). O passo vem do `Time` da cena.
