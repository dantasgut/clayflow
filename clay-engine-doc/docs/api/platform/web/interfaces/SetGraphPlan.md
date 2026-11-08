[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / SetGraphPlan

# Interface: SetGraphPlan

Defined in: [src/scene/graph/compileSetGraph.ts:41](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/compileSetGraph.ts#L41)

Plano de execução de um grafo de conjunto.

## Properties

### animated

> `readonly` **animated**: `boolean`

Defined in: [src/scene/graph/compileSetGraph.ts:51](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/compileSetGraph.ts#L51)

Algum nó depende do tempo.

***

### cpuCounts

> `readonly` **cpuCounts**: `ReadonlyMap`\<`number`, `number`\>

Defined in: [src/scene/graph/compileSetGraph.ts:49](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/compileSetGraph.ts#L49)

Contagens conhecidas na CPU, por registro.

***

### nodes

> `readonly` **nodes**: readonly [`PlannedNode`](PlannedNode.md)[]

Defined in: [src/scene/graph/compileSetGraph.ts:43](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/compileSetGraph.ts#L43)

Nós em ordem topológica.

***

### sets

> `readonly` **sets**: readonly [`PlannedSet`](PlannedSet.md)[]

Defined in: [src/scene/graph/compileSetGraph.ts:45](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/compileSetGraph.ts#L45)

Conjuntos a alocar (as saídas dos nós), na ordem dos nós.

***

### slots

> `readonly` **slots**: `number`

Defined in: [src/scene/graph/compileSetGraph.ts:47](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/compileSetGraph.ts#L47)

Registros `SetCount`.
