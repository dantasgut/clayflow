[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / SetNodeDefinition

# Interface: SetNodeDefinition

Defined in: [src/scene/graph/SetNode.ts:134](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L134)

Definição de um nó de conjunto (imutável).

## Properties

### animated

> `readonly` **animated**: `boolean`

Defined in: [src/scene/graph/SetNode.ts:142](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L142)

***

### capacity

> `readonly` **capacity**: (`c`) => `Readonly`\<`Record`\<`string`, `number`\>\>

Defined in: [src/scene/graph/SetNode.ts:140](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L140)

#### Parameters

##### c

[`CapacityContext`](CapacityContext.md)

#### Returns

`Readonly`\<`Record`\<`string`, `number`\>\>

***

### counts

> `readonly` **counts**: `Readonly`\<`Record`\<`string`, [`SetCountRule`](../type-aliases/SetCountRule.md)\>\>

Defined in: [src/scene/graph/SetNode.ts:141](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L141)

***

### create

> `readonly` **create**: (`c`) => [`SetNodeInstance`](SetNodeInstance.md)

Defined in: [src/scene/graph/SetNode.ts:143](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L143)

#### Parameters

##### c

[`SetNodeContext`](SetNodeContext.md)

#### Returns

[`SetNodeInstance`](SetNodeInstance.md)

***

### inputs

> `readonly` **inputs**: `Readonly`\<`Record`\<`string`, [`SetType`](SetType.md) \| [`SetPointInput`](SetPointInput.md)\>\>

Defined in: [src/scene/graph/SetNode.ts:137](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L137)

***

### level

> `readonly` **level**: `"set"`

Defined in: [src/scene/graph/SetNode.ts:135](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L135)

***

### name

> `readonly` **name**: `string`

Defined in: [src/scene/graph/SetNode.ts:136](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L136)

***

### outputs

> `readonly` **outputs**: `Readonly`\<`Record`\<`string`, [`SetType`](SetType.md)\>\>

Defined in: [src/scene/graph/SetNode.ts:138](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L138)

***

### params

> `readonly` **params**: `Readonly`\<`Record`\<`string`, [`NodeParam`](NodeParam.md)\>\>

Defined in: [src/scene/graph/SetNode.ts:139](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L139)

## Methods

### with()

> **with**(`values`): [`SetNodeUse`](SetNodeUse.md)

Defined in: [src/scene/graph/SetNode.ts:145](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L145)

Uso do nó com valores próprios.

#### Parameters

##### values

`Readonly`\<`Record`\<`string`, [`ExtensionParamValue`](../type-aliases/ExtensionParamValue.md)\>\>

#### Returns

[`SetNodeUse`](SetNodeUse.md)
