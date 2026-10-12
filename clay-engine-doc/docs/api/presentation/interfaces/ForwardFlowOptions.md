[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / ForwardFlowOptions

# Interface: ForwardFlowOptions

Defined in: [presentation/flows/ForwardFlow.ts:102](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/flows/ForwardFlow.ts#L102)

Opções do `ForwardFlow`.

## Properties

### output?

> `readonly` `optional` **output?**: [`ForwardOutput`](../type-aliases/ForwardOutput.md)

Defined in: [presentation/flows/ForwardFlow.ts:104](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/flows/ForwardFlow.ts#L104)

Onde desenhar a cor. Padrão `'scene'` (o pós-processamento compõe no canvas).

***

### preferAsync?

> `readonly` `optional` **preferAsync?**: `boolean`

Defined in: [presentation/flows/ForwardFlow.ts:106](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/flows/ForwardFlow.ts#L106)

Compila os pipelines de material em segundo plano; objetos de um material ainda compilando não são desenhados.
