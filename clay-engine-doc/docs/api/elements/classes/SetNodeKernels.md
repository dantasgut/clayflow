[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / SetNodeKernels

# Class: SetNodeKernels

Defined in: [src/elements/nodes/set/SetNodeKernels.ts:29](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/nodes/set/SetNodeKernels.ts#L29)

O que uma instância de nó de conjunto possui na GPU (spec 031, R10): o uniform dos parâmetros (escrito pela CPU em
`update`), buffers próprios e os kernels, todos com o prefixo da instância e liberados juntos em `dispose`. Os
despachos sobre um conjunto vão pelo argumento indireto do registro `SetCount` dele (da CPU ou derivado na GPU por
`CountToArgs`), em grupos de `SET_GROUP`.

Uniforms e buffers são descritores do Resource de trabalho do grafo (spec 039, `ctx.work`): cada pedido redescreve o
trabalho e a C2 aloca na hora; os uniforms são de uma região, escritos na hora pela C2 (`writeRegions`); `dispose`
solta os descritores e a C2 libera os buffers.

## Implements

- [`WorkPart`](../../platform/web/interfaces/WorkPart.md)

## Constructors

### Constructor

> **new SetNodeKernels**(`ctx`, `schema`): `SetNodeKernels`

Defined in: [src/elements/nodes/set/SetNodeKernels.ts:41](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/nodes/set/SetNodeKernels.ts#L41)

#### Parameters

##### ctx

[`SetNodeContext`](../../platform/web/interfaces/SetNodeContext.md)

##### schema

[`StructSchema`](../../platform/web/classes/StructSchema.md)

#### Returns

`SetNodeKernels`

## Properties

### params

> `readonly` **params**: [`UniformBufferSpec`](../../platform/web/interfaces/UniformBufferSpec.md)

Defined in: [src/elements/nodes/set/SetNodeKernels.ts:39](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/nodes/set/SetNodeKernels.ts#L39)

Uniform dos parâmetros da instância.

## Methods

### constant()

> **constant**(`name`, `data`): [`StorageBufferSpec`](../../platform/web/interfaces/StorageBufferSpec.md)

Defined in: [src/elements/nodes/set/SetNodeKernels.ts:67](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/nodes/set/SetNodeKernels.ts#L67)

Buffer de storage próprio só de leitura com o conteúdo `data` (palavras de 32 bits), enviado pela C2 na alocação
(ex.: uma tabela de senos e cossenos fixa na criação do nó).

#### Parameters

##### name

`string`

##### data

`Float32Array`\<`ArrayBufferLike`\> \| `Uint32Array`\<`ArrayBufferLike`\>

#### Returns

[`StorageBufferSpec`](../../platform/web/interfaces/StorageBufferSpec.md)

***

### descriptors()

> **descriptors**(): readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

Defined in: [src/elements/nodes/set/SetNodeKernels.ts:49](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/nodes/set/SetNodeKernels.ts#L49)

Os descritores atuais da parte (ids únicos no Resource de trabalho).

#### Returns

readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

#### Implementation of

[`WorkPart`](../../platform/web/interfaces/WorkPart.md).[`descriptors`](../../platform/web/interfaces/WorkPart.md#descriptors)

***

### direct()

> **direct**(`frame`, `label`, `name`, `invocations`): `void`

Defined in: [src/elements/nodes/set/SetNodeKernels.ts:136](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/nodes/set/SetNodeKernels.ts#L136)

Despacho direto de `invocations` invocações (contagem conhecida na CPU: a capacidade de um alvo, um parâmetro).

#### Parameters

##### frame

[`Frame`](../../platform/web/interfaces/Frame.md)

##### label

`string`

##### name

`string`

##### invocations

`number`

#### Returns

`void`

***

### dispose()

> **dispose**(): `void`

Defined in: [src/elements/nodes/set/SetNodeKernels.ts:146](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/nodes/set/SetNodeKernels.ts#L146)

Libera os kernels e solta uniforms e buffers próprios (a C2 os libera com a redescrição do trabalho).

#### Returns

`void`

***

### indirect()

> **indirect**(`frame`, `label`, `name`, `slot`): `void`

Defined in: [src/elements/nodes/set/SetNodeKernels.ts:129](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/nodes/set/SetNodeKernels.ts#L129)

Despacho pelo argumento indireto do registro `slot` dos contadores do grafo (contagem lida no kernel).

#### Parameters

##### frame

[`Frame`](../../platform/web/interfaces/Frame.md)

##### label

`string`

##### name

`string`

##### slot

`number`

#### Returns

`void`

***

### kernel()

> **kernel**(`name`, `shader`, `entry`, `bindings`): `void`

Defined in: [src/elements/nodes/set/SetNodeKernels.ts:109](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/nodes/set/SetNodeKernels.ts#L109)

Cria (ou troca) o kernel `name`: a entrada `entry` de `shader` com as fontes pela identidade do recurso.

#### Parameters

##### name

`string`

##### shader

[`WgslModule`](../../platform/web/interfaces/WgslModule.md)

##### entry

`string`

##### bindings

readonly readonly \[[`WgslResource`](../../platform/web/interfaces/WgslResource.md), [`BindingSource`](../../platform/web/type-aliases/BindingSource.md)\][]

#### Returns

`void`

***

### records()

> **records**(`name`, `byteSize`): [`IndirectBufferSpec`](../../platform/web/interfaces/IndirectBufferSpec.md)

Defined in: [src/elements/nodes/set/SetNodeKernels.ts:102](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/nodes/set/SetNodeKernels.ts#L102)

Registros `SetCount` próprios (descritor `indirect`).

#### Parameters

##### name

`string`

##### byteSize

`number`

#### Returns

[`IndirectBufferSpec`](../../platform/web/interfaces/IndirectBufferSpec.md)

***

### single()

> **single**(`frame`, `label`, `name`): `void`

Defined in: [src/elements/nodes/set/SetNodeKernels.ts:141](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/nodes/set/SetNodeKernels.ts#L141)

Um grupo de uma invocação (kernels que derivam contagens).

#### Parameters

##### frame

[`Frame`](../../platform/web/interfaces/Frame.md)

##### label

`string`

##### name

`string`

#### Returns

`void`

***

### storage()

> **storage**(`name`, `byteSize`): [`StorageBufferSpec`](../../platform/web/interfaces/StorageBufferSpec.md)

Defined in: [src/elements/nodes/set/SetNodeKernels.ts:59](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/nodes/set/SetNodeKernels.ts#L59)

Buffer de storage próprio de `byteSize` bytes (mínimo 16).

#### Parameters

##### name

`string`

##### byteSize

`number`

#### Returns

[`StorageBufferSpec`](../../platform/web/interfaces/StorageBufferSpec.md)

***

### uniform()

> **uniform**(`name`, `schema`): [`UniformBufferSpec`](../../platform/web/interfaces/UniformBufferSpec.md)

Defined in: [src/elements/nodes/set/SetNodeKernels.ts:79](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/nodes/set/SetNodeKernels.ts#L79)

Uniform próprio adicional com o layout de `schema` (ex.: o da contagem aceita), escrito com `writeTo`.

#### Parameters

##### name

`string`

##### schema

[`StructSchema`](../../platform/web/classes/StructSchema.md)

#### Returns

[`UniformBufferSpec`](../../platform/web/interfaces/UniformBufferSpec.md)

***

### write()

> **write**(`data`): `void`

Defined in: [src/elements/nodes/set/SetNodeKernels.ts:54](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/nodes/set/SetNodeKernels.ts#L54)

Escreve os parâmetros (fora da gravação: `update`).

#### Parameters

##### data

`Record`\<`string`, `unknown`\>

#### Returns

`void`

***

### writeTo()

> **writeTo**(`buffer`, `schema`, `data`): `void`

Defined in: [src/elements/nodes/set/SetNodeKernels.ts:92](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/nodes/set/SetNodeKernels.ts#L92)

Escreve `data` com o layout de `schema` num uniform próprio (fora da gravação).

#### Parameters

##### buffer

[`UniformBufferSpec`](../../platform/web/interfaces/UniformBufferSpec.md)

##### schema

[`StructSchema`](../../platform/web/classes/StructSchema.md)

##### data

`Record`\<`string`, `unknown`\>

#### Returns

`void`
