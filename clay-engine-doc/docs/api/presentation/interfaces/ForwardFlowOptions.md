[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / ForwardFlowOptions

# Interface: ForwardFlowOptions

Defined in: [presentation/flows/ForwardFlow.ts:106](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/presentation/flows/ForwardFlow.ts#L106)

Opções do `ForwardFlow`.

## Properties

### output?

> `readonly` `optional` **output?**: [`ForwardOutput`](../type-aliases/ForwardOutput.md)

Defined in: [presentation/flows/ForwardFlow.ts:108](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/presentation/flows/ForwardFlow.ts#L108)

Onde desenhar a cor. Padrão `'scene'` (o pós-processamento compõe no canvas).

***

### preferAsync?

> `readonly` `optional` **preferAsync?**: `boolean`

Defined in: [presentation/flows/ForwardFlow.ts:110](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/presentation/flows/ForwardFlow.ts#L110)

Compila os pipelines de material em segundo plano; objetos de um material ainda compilando não são desenhados.
