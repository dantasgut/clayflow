[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [presentation](../README.md) / ForwardFlowOptions

# Interface: ForwardFlowOptions

Defined in: [src/presentation/flows/ForwardFlow.ts:298](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ForwardFlow.ts#L298)

Opções do `ForwardFlow`.

## Properties

### depthPrepass?

> `readonly` `optional` **depthPrepass?**: `boolean`

Defined in: [src/presentation/flows/ForwardFlow.ts:309](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ForwardFlow.ts#L309)

Passe de profundidade dos opacos antes da cor (spec 033): cada pixel é sombreado uma vez — o sombreamento caro (a
luz rebatida) não paga os fragmentos encobertos. `true` sempre; `false` nunca (sem os pipelines de profundidade);
sem valor (o padrão), o dos `FrameTargets` (`depthPrepass`, ligado pelos estágios padrão com a luz rebatida), lido
a cada quadro sem recompilar.

***

### output?

> `readonly` `optional` **output?**: [`ForwardOutput`](../type-aliases/ForwardOutput.md)

Defined in: [src/presentation/flows/ForwardFlow.ts:300](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ForwardFlow.ts#L300)

Onde desenhar a cor. Padrão `'scene'` (o pós-processamento compõe no canvas).

***

### preferAsync?

> `readonly` `optional` **preferAsync?**: `boolean`

Defined in: [src/presentation/flows/ForwardFlow.ts:302](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ForwardFlow.ts#L302)

Compila os pipelines de material em segundo plano; objetos de um material ainda compilando não são desenhados.
