[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / ForwardFlowOptions

# Interface: ForwardFlowOptions

Defined in: [presentation/flows/ForwardFlow.ts:158](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/ForwardFlow.ts#L158)

Opções do `ForwardFlow`.

## Properties

### output?

> `readonly` `optional` **output?**: [`ForwardOutput`](../type-aliases/ForwardOutput.md)

Defined in: [presentation/flows/ForwardFlow.ts:160](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/ForwardFlow.ts#L160)

Onde desenhar a cor. Padrão `'scene'` (o pós-processamento compõe no canvas).

***

### preferAsync?

> `readonly` `optional` **preferAsync?**: `boolean`

Defined in: [presentation/flows/ForwardFlow.ts:162](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/ForwardFlow.ts#L162)

Compila os pipelines de material em segundo plano; objetos de um material ainda compilando não são desenhados.
