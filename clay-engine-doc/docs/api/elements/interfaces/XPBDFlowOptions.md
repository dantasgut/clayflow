[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / XPBDFlowOptions

# Interface: XPBDFlowOptions

Defined in: [elements/physics/flows/XPBDFlow.ts:26](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/physics/flows/XPBDFlow.ts#L26)

Opções do `XPBDFlow`.

## Properties

### constraintPoolKey?

> `readonly` `optional` **constraintPoolKey?**: `string`

Defined in: [elements/physics/flows/XPBDFlow.ts:28](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/physics/flows/XPBDFlow.ts#L28)

Pool das restrições de distância (padrão `DistanceConstraint`).

***

### solverIters?

> `readonly` `optional` **solverIters?**: `number`

Defined in: [elements/physics/flows/XPBDFlow.ts:32](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/physics/flows/XPBDFlow.ts#L32)

Iterações do solver de restrições por substep (padrão 1).

***

### substeps?

> `readonly` `optional` **substeps?**: `number`

Defined in: [elements/physics/flows/XPBDFlow.ts:30](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/physics/flows/XPBDFlow.ts#L30)

Substeps por passo de física (padrão 8). O passo vem do `Time` da cena.
