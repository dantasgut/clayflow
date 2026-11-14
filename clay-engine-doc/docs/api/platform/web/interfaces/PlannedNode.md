[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / PlannedNode

# Interface: PlannedNode

Defined in: [src/scene/graph/compileSetGraph.ts:32](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/compileSetGraph.ts#L32)

Um nó de conjunto do plano: os conjuntos ligados às entradas, os de saída e os grafos de ponto fundidos.

## Properties

### definition

> `readonly` **definition**: [`SetNodeDefinition`](SetNodeDefinition.md)

Defined in: [src/scene/graph/compileSetGraph.ts:34](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/compileSetGraph.ts#L34)

***

### id

> `readonly` **id**: `string`

Defined in: [src/scene/graph/compileSetGraph.ts:33](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/compileSetGraph.ts#L33)

***

### inputs

> `readonly` **inputs**: `ReadonlyMap`\<`string`, [`PlannedSet`](PlannedSet.md)\>

Defined in: [src/scene/graph/compileSetGraph.ts:35](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/compileSetGraph.ts#L35)

***

### outputs

> `readonly` **outputs**: `ReadonlyMap`\<`string`, [`PlannedSet`](PlannedSet.md)\>

Defined in: [src/scene/graph/compileSetGraph.ts:36](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/compileSetGraph.ts#L36)

***

### points

> `readonly` **points**: `ReadonlyMap`\<`string`, [`FusedPointPlan`](FusedPointPlan.md)\>

Defined in: [src/scene/graph/compileSetGraph.ts:37](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/compileSetGraph.ts#L37)
