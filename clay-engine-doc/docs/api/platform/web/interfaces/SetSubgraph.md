[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / SetSubgraph

# Interface: SetSubgraph

Defined in: [src/scene/graph/NodeGraph.ts:25](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeGraph.ts#L25)

Sub-grafo de conjunto (spec 031, R9/US4): expandido no grafo que o usa (nós de dentro com o prefixo do uso), para
que conjuntos e contagens circulem entre dentro e fora sem cópia. Os parâmetros expostos (`nó_parâmetro`) recebem o
valor do uso; os outros, o do sub-grafo.

## Properties

### expose

> `readonly` **expose**: readonly `string`[]

Defined in: [src/scene/graph/NodeGraph.ts:32](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeGraph.ts#L32)

Parâmetros expostos como declarados (`nó.parâmetro`).

***

### graph

> `readonly` **graph**: [`NodeGraph`](../classes/NodeGraph.md)

Defined in: [src/scene/graph/NodeGraph.ts:28](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeGraph.ts#L28)

***

### inputs

> `readonly` **inputs**: `Readonly`\<`Record`\<`string`, `string`\>\>

Defined in: [src/scene/graph/NodeGraph.ts:29](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeGraph.ts#L29)

***

### level

> `readonly` **level**: `"subgraph"`

Defined in: [src/scene/graph/NodeGraph.ts:26](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeGraph.ts#L26)

***

### name

> `readonly` **name**: `string`

Defined in: [src/scene/graph/NodeGraph.ts:27](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeGraph.ts#L27)

***

### outputs

> `readonly` **outputs**: `Readonly`\<`Record`\<`string`, `string`\>\>

Defined in: [src/scene/graph/NodeGraph.ts:30](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeGraph.ts#L30)

***

### params

> `readonly` **params**: `Readonly`\<`Record`\<`string`, \{ `default`: [`ExtensionParamValue`](../type-aliases/ExtensionParamValue.md); `type`: [`ExtensionParamType`](../type-aliases/ExtensionParamType.md); \}\>\>

Defined in: [src/scene/graph/NodeGraph.ts:34](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeGraph.ts#L34)

Parâmetros expostos: `nó_parâmetro` → tipo e valor do sub-grafo.

## Methods

### with()

> **with**(`values`): [`SetSubgraphUse`](SetSubgraphUse.md)

Defined in: [src/scene/graph/NodeGraph.ts:37](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeGraph.ts#L37)

#### Parameters

##### values

`Readonly`\<`Record`\<`string`, [`ExtensionParamValue`](../type-aliases/ExtensionParamValue.md)\>\>

#### Returns

[`SetSubgraphUse`](SetSubgraphUse.md)
