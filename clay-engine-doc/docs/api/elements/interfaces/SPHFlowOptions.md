[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / SPHFlowOptions

# Interface: SPHFlowOptions

Defined in: [elements/physics/flows/SPHFlow.ts:35](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/physics/flows/SPHFlow.ts#L35)

Opções do `SPHFlow`.

## Properties

### maxNeighbors?

> `readonly` `optional` **maxNeighbors?**: `number`

Defined in: [elements/physics/flows/SPHFlow.ts:39](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/physics/flows/SPHFlow.ts#L39)

Vizinhos guardados por partícula (padrão 128; o suporte 2h tem ~73 vizinhos em repouso).

***

### substeps?

> `readonly` `optional` **substeps?**: `number`

Defined in: [elements/physics/flows/SPHFlow.ts:37](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/physics/flows/SPHFlow.ts#L37)

Mínimo de substeps por passo (padrão 1); o passo estável do `ParticleMaterial` pode exigir mais.
