[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / SetNodeContext

# Interface: SetNodeContext

Defined in: [src/scene/graph/SetNode.ts:71](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L71)

O que a instância de um nó de conjunto recebe do `GraphFlow`.

## Properties

### core

> `readonly` **core**: [`EngineCore`](EngineCore.md)

Defined in: [src/scene/graph/SetNode.ts:72](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L72)

***

### counts

> `readonly` **counts**: [`IndirectBufferSpec`](IndirectBufferSpec.md)

Defined in: [src/scene/graph/SetNode.ts:81](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L81)

Os registros `SetCount` do grafo (descritor `indirect`, lido como `array<SetCount>`).

***

### id

> `readonly` **id**: `string`

Defined in: [src/scene/graph/SetNode.ts:79](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L79)

Prefixo único dos recursos desta instância.

***

### work

> `readonly` **work**: [`WorkContext`](WorkContext.md)

Defined in: [src/scene/graph/SetNode.ts:77](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L77)

O espaço de trabalho do nó (spec 039): o Resource de trabalho do `GraphFlow` dono, o diretório da C2 e o core.
Parâmetros, buffers próprios e os primitivos (`PrefixSum`, `Compaction`…) declaram neles os seus descritores.

## Methods

### input()

> **input**(`port`, `set`): [`SetBuffer`](SetBuffer.md)

Defined in: [src/scene/graph/SetNode.ts:83](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L83)

Conjunto ligado à entrada `port`.

#### Parameters

##### port

`string`

##### set

`string`

#### Returns

[`SetBuffer`](SetBuffer.md)

***

### output()

> **output**(`port`, `set`): [`SetBuffer`](SetBuffer.md)

Defined in: [src/scene/graph/SetNode.ts:85](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L85)

Conjunto alocado para a saída `port`.

#### Parameters

##### port

`string`

##### set

`string`

#### Returns

[`SetBuffer`](SetBuffer.md)

***

### point()

> **point**(`port`): [`FusedPoint`](FusedPoint.md) \| `undefined`

Defined in: [src/scene/graph/SetNode.ts:87](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L87)

Grafo de ponto fundido na entrada `port`, ou `undefined` (o kernel usa o pronto).

#### Parameters

##### port

`string`

#### Returns

[`FusedPoint`](FusedPoint.md) \| `undefined`

***

### target()

> **target**(`descId`): [`StorageBufferSpec`](StorageBufferSpec.md) \| [`VertexBufferSpec`](VertexBufferSpec.md) \| [`IndexBufferSpec`](IndexBufferSpec.md) \| [`UniformBufferSpec`](UniformBufferSpec.md) \| [`IndirectBufferSpec`](IndirectBufferSpec.md) \| `undefined`

Defined in: [src/scene/graph/SetNode.ts:91](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L91)

Buffer `descId` do Resource alvo do grafo (a geometria de saída), ou `undefined`.

#### Parameters

##### descId

`string`

#### Returns

[`StorageBufferSpec`](StorageBufferSpec.md) \| [`VertexBufferSpec`](VertexBufferSpec.md) \| [`IndexBufferSpec`](IndexBufferSpec.md) \| [`UniformBufferSpec`](UniformBufferSpec.md) \| [`IndirectBufferSpec`](IndirectBufferSpec.md) \| `undefined`

***

### values()

> **values**(): `Readonly`\<`Record`\<`string`, [`ExtensionParamValue`](../type-aliases/ExtensionParamValue.md)\>\>

Defined in: [src/scene/graph/SetNode.ts:89](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/SetNode.ts#L89)

Valores atuais dos parâmetros do nó (pelo nome do parâmetro).

#### Returns

`Readonly`\<`Record`\<`string`, [`ExtensionParamValue`](../type-aliases/ExtensionParamValue.md)\>\>
