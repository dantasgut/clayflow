[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / ForwardFlowOptions

# Interface: ForwardFlowOptions

Defined in: [presentation/flows/ForwardFlow.ts:101](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/presentation/flows/ForwardFlow.ts#L101)

Opções do `ForwardFlow`.

## Properties

### output?

> `readonly` `optional` **output?**: [`ForwardOutput`](../type-aliases/ForwardOutput.md)

Defined in: [presentation/flows/ForwardFlow.ts:103](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/presentation/flows/ForwardFlow.ts#L103)

Onde desenhar a cor. Padrão `'scene'` (o pós-processamento compõe no canvas).

***

### preferAsync?

> `readonly` `optional` **preferAsync?**: `boolean`

Defined in: [presentation/flows/ForwardFlow.ts:105](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/presentation/flows/ForwardFlow.ts#L105)

Compila os pipelines de material em segundo plano; objetos de um material ainda compilando não são desenhados.
