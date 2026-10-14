[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / ForwardFlowOptions

# Interface: ForwardFlowOptions

Defined in: [presentation/flows/ForwardFlow.ts:150](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/flows/ForwardFlow.ts#L150)

Opções do `ForwardFlow`.

## Properties

### output?

> `readonly` `optional` **output?**: [`ForwardOutput`](../type-aliases/ForwardOutput.md)

Defined in: [presentation/flows/ForwardFlow.ts:152](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/flows/ForwardFlow.ts#L152)

Onde desenhar a cor. Padrão `'scene'` (o pós-processamento compõe no canvas).

***

### preferAsync?

> `readonly` `optional` **preferAsync?**: `boolean`

Defined in: [presentation/flows/ForwardFlow.ts:154](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/flows/ForwardFlow.ts#L154)

Compila os pipelines de material em segundo plano; objetos de um material ainda compilando não são desenhados.
