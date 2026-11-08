[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / SetNodeDefinitionOptions

# Interface: SetNodeDefinitionOptions

Defined in: [src/scene/graph/SetNode.ts:115](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L115)

Opções de `defineSetNode`.

## Properties

### animated?

> `readonly` `optional` **animated?**: `boolean`

Defined in: [src/scene/graph/SetNode.ts:128](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L128)

O nó depende do tempo: o grafo é refeito a cada quadro.

***

### capacity?

> `readonly` `optional` **capacity?**: (`c`) => `Readonly`\<`Record`\<`string`, `number`\>\>

Defined in: [src/scene/graph/SetNode.ts:124](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L124)

Capacidade de cada conjunto de saída (`'porta.conjunto'` → elementos), pelos valores e pelas entradas. Mudou com
um valor novo: o `GraphFlow` realoca e recria a instância.

#### Parameters

##### c

[`CapacityContext`](CapacityContext.md)

#### Returns

`Readonly`\<`Record`\<`string`, `number`\>\>

***

### counts?

> `readonly` `optional` **counts?**: `Readonly`\<`Record`\<`string`, [`SetCountRule`](../type-aliases/SetCountRule.md)\>\>

Defined in: [src/scene/graph/SetNode.ts:126](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L126)

Contagem de cada conjunto de saída (`'porta.conjunto'`); padrão `cpu`.

***

### create

> `readonly` **create**: (`c`) => [`SetNodeInstance`](SetNodeInstance.md)

Defined in: [src/scene/graph/SetNode.ts:130](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L130)

Cria a instância (kernels ligados aos conjuntos).

#### Parameters

##### c

[`SetNodeContext`](SetNodeContext.md)

#### Returns

[`SetNodeInstance`](SetNodeInstance.md)

***

### inputs?

> `readonly` `optional` **inputs?**: `Readonly`\<`Record`\<`string`, [`SetType`](SetType.md) \| [`SetPointInput`](SetPointInput.md)\>\>

Defined in: [src/scene/graph/SetNode.ts:117](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L117)

***

### name

> `readonly` **name**: `string`

Defined in: [src/scene/graph/SetNode.ts:116](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L116)

***

### outputs?

> `readonly` `optional` **outputs?**: `Readonly`\<`Record`\<`string`, [`SetType`](SetType.md)\>\>

Defined in: [src/scene/graph/SetNode.ts:118](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L118)

***

### params?

> `readonly` `optional` **params?**: `Readonly`\<`Record`\<`string`, [`NodeParam`](NodeParam.md)\>\>

Defined in: [src/scene/graph/SetNode.ts:119](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L119)
