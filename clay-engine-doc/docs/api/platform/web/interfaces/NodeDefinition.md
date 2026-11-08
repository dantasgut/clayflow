[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / NodeDefinition

# Interface: NodeDefinition

Defined in: [src/scene/graph/NodeDefinition.ts:54](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeDefinition.ts#L54)

Definição de um nó de ponto (imutável): portas, parâmetros, código.

## Properties

### code

> `readonly` **code**: [`WgslModule`](WgslModule.md)

Defined in: [src/scene/graph/NodeDefinition.ts:62](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeDefinition.ts#L62)

***

### contexts

> `readonly` **contexts**: readonly [`NodeContext`](../type-aliases/NodeContext.md)[]

Defined in: [src/scene/graph/NodeDefinition.ts:64](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeDefinition.ts#L64)

***

### defaults

> `readonly` **defaults**: `Readonly`\<`Record`\<`string`, `string`\>\>

Defined in: [src/scene/graph/NodeDefinition.ts:61](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeDefinition.ts#L61)

***

### fn

> `readonly` **fn**: `string`

Defined in: [src/scene/graph/NodeDefinition.ts:63](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeDefinition.ts#L63)

***

### inputs

> `readonly` **inputs**: `Readonly`\<`Record`\<`string`, [`PortType`](../type-aliases/PortType.md)\>\>

Defined in: [src/scene/graph/NodeDefinition.ts:58](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeDefinition.ts#L58)

***

### level

> `readonly` **level**: `"point"`

Defined in: [src/scene/graph/NodeDefinition.ts:56](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeDefinition.ts#L56)

Nível: avaliado por amostra, fundido na função do grafo.

***

### name

> `readonly` **name**: `string`

Defined in: [src/scene/graph/NodeDefinition.ts:57](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeDefinition.ts#L57)

***

### outputs

> `readonly` **outputs**: `Readonly`\<`Record`\<`string`, [`PortType`](../type-aliases/PortType.md)\>\>

Defined in: [src/scene/graph/NodeDefinition.ts:59](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeDefinition.ts#L59)

***

### params

> `readonly` **params**: `Readonly`\<`Record`\<`string`, [`NodeParam`](NodeParam.md)\>\>

Defined in: [src/scene/graph/NodeDefinition.ts:60](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeDefinition.ts#L60)

***

### tags

> `readonly` **tags**: readonly `string`[]

Defined in: [src/scene/graph/NodeDefinition.ts:66](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeDefinition.ts#L66)

Marcas livres do nó (ver `NodeDefinitionOptions.tags`).

## Methods

### with()

> **with**(`values`): [`NodeUse`](NodeUse.md)

Defined in: [src/scene/graph/NodeDefinition.ts:68](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeDefinition.ts#L68)

Uso do nó com valores de parâmetros próprios (o código é o mesmo).

#### Parameters

##### values

`Readonly`\<`Record`\<`string`, [`ExtensionParamValue`](../type-aliases/ExtensionParamValue.md)\>\>

#### Returns

[`NodeUse`](NodeUse.md)
