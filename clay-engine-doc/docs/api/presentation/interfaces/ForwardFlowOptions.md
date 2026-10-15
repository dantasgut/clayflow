[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / ForwardFlowOptions

# Interface: ForwardFlowOptions

Defined in: [presentation/flows/ForwardFlow.ts:192](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/flows/ForwardFlow.ts#L192)

Opções do `ForwardFlow`.

## Properties

### output?

> `readonly` `optional` **output?**: [`ForwardOutput`](../type-aliases/ForwardOutput.md)

Defined in: [presentation/flows/ForwardFlow.ts:194](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/flows/ForwardFlow.ts#L194)

Onde desenhar a cor. Padrão `'scene'` (o pós-processamento compõe no canvas).

***

### preferAsync?

> `readonly` `optional` **preferAsync?**: `boolean`

Defined in: [presentation/flows/ForwardFlow.ts:196](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/flows/ForwardFlow.ts#L196)

Compila os pipelines de material em segundo plano; objetos de um material ainda compilando não são desenhados.
