[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / NodeRegistry

# Class: NodeRegistry

Defined in: [src/scene/graph/NodeRegistry.ts:12](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeRegistry.ts#L12)

Registro de definições de nós por nome (spec 031): o que a serialização usa para reconstruir um grafo (`fromJSON`) e o
que uma biblioteca de nós publica. Um nome, uma definição.

## Constructors

### Constructor

> **new NodeRegistry**(`definitions?`): `NodeRegistry`

Defined in: [src/scene/graph/NodeRegistry.ts:15](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeRegistry.ts#L15)

#### Parameters

##### definitions?

readonly [`AnyNodeDefinition`](../type-aliases/AnyNodeDefinition.md)[] = `[]`

#### Returns

`NodeRegistry`

## Methods

### get()

> **get**(`name`): [`AnyNodeDefinition`](../type-aliases/AnyNodeDefinition.md) \| `undefined`

Defined in: [src/scene/graph/NodeRegistry.ts:37](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeRegistry.ts#L37)

A definição de nome `name`, ou `undefined`.

#### Parameters

##### name

`string`

#### Returns

[`AnyNodeDefinition`](../type-aliases/AnyNodeDefinition.md) \| `undefined`

***

### names()

> **names**(): readonly `string`[]

Defined in: [src/scene/graph/NodeRegistry.ts:42](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeRegistry.ts#L42)

Nomes registrados, em ordem de registro.

#### Returns

readonly `string`[]

***

### register()

> **register**(`definition`): `void`

Defined in: [src/scene/graph/NodeRegistry.ts:24](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeRegistry.ts#L24)

Registra `definition`.

#### Parameters

##### definition

[`AnyNodeDefinition`](../type-aliases/AnyNodeDefinition.md)

#### Returns

`void`

#### Throws

NodeGraphError (`node-signature`) se o nome já tem outra definição.
