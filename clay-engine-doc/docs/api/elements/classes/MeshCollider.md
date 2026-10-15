[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / MeshCollider

# Class: MeshCollider

Defined in: [elements/physics/colliders/MeshCollider.ts:24](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/colliders/MeshCollider.ts#L24)

Collider triangle-mesh estático — referencia faixa do triangle pool
(firstTriangle + triangleCount). Para shapes deformáveis, use SoftBody.

## Extends

- [`Collider`](Collider.md)\<[`MeshColliderData`](../interfaces/MeshColliderData.md)\>

## Constructors

### Constructor

> **new MeshCollider**(`values?`): `MeshCollider`

Defined in: [elements/physics/colliders/MeshCollider.ts:33](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/colliders/MeshCollider.ts#L33)

#### Parameters

##### values?

`Partial`\<`Pick`\<[`MeshColliderData`](../interfaces/MeshColliderData.md), `"triangles"`\>\> = `{}`

#### Returns

`MeshCollider`

#### Overrides

[`Collider`](Collider.md).[`constructor`](Collider.md#constructor)

## Properties

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/physics/colliders/Collider.ts:12](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/colliders/Collider.ts#L12)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Inherited from

[`Collider`](Collider.md).[`state`](Collider.md#state)

***

### schema

> `readonly` `static` **schema**: `StructSchema`

Defined in: [elements/physics/colliders/MeshCollider.ts:26](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/colliders/MeshCollider.ts#L26)

StructSchema do MeshCollider (triangleCount + firstTriangle).

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](Entity.md)\<`object`\>[]

Defined in: [scene/contracts/Entity.ts:138](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/scene/contracts/Entity.ts#L138)

Lista somente-leitura dos filhos diretos. World.insert traverse essa
árvore recursivamente para coletar todos os Resources de um root.

##### Returns

readonly [`Entity`](Entity.md)\<`object`\>[]

#### Inherited from

[`Collider`](Collider.md).[`attached`](Collider.md#attached)

***

### data

#### Get Signature

> **get** **data**(): `TData`

Defined in: [scene/contracts/Entity.ts:90](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/scene/contracts/Entity.ts#L90)

Dados do Resource (o layout é o do schema dos descritores). Na cena, mutações de campo (`data.position = …`,
`data.position[0] = …`) e a reatribuição inteira (`data = …`) marcam o recurso para envio.

##### Returns

`TData`

#### Set Signature

> **set** **data**(`next`): `void`

Defined in: [scene/contracts/Entity.ts:96](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/scene/contracts/Entity.ts#L96)

Troca o dado inteiro; na cena, o recurso inteiro é marcado para envio.

##### Parameters

###### next

`TData`

##### Returns

`void`

#### Inherited from

[`Collider`](Collider.md).[`data`](Collider.md#data)

***

### rawData

#### Get Signature

> **get** `protected` **rawData**(): `Readonly`\<`TData`\>

Defined in: [scene/contracts/Entity.ts:110](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/scene/contracts/Entity.ts#L110)

O dado cru, sem o proxy reativo — para leituras do próprio Resource (ex.: uma propriedade derivada consultada pelos
estágios) que não devem criar proxies aninhados. Escrever por aqui não marca o recurso.

##### Returns

`Readonly`\<`TData`\>

#### Inherited from

[`Collider`](Collider.md).[`rawData`](Collider.md#rawdata)

## Methods

### add()

> **add**(`e`): `this`

Defined in: [scene/contracts/Entity.ts:118](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/scene/contracts/Entity.ts#L118)

Anexa uma Entity-filha. Retorna `this` para chaining fluente.
Não valida ciclos nem múltiplos pais — responsabilidade do caller.

#### Parameters

##### e

[`Entity`](Entity.md)\<`object`\>

#### Returns

`this`

#### Inherited from

[`Collider`](Collider.md).[`add`](Collider.md#add)

***

### detach()

> **detach**(`e`): `boolean`

Defined in: [scene/contracts/Entity.ts:127](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/scene/contracts/Entity.ts#L127)

Desanexa uma Entity-filha direta (inverso de `add`). Devolve `false` se ela não é filha desta. Numa entidade já
inserida, use `World.detach` (que também atualiza a cena).

#### Parameters

##### e

[`Entity`](Entity.md)\<`object`\>

#### Returns

`boolean`

#### Inherited from

[`Collider`](Collider.md).[`detach`](Collider.md#detach)

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [elements/physics/colliders/MeshCollider.ts:45](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/colliders/MeshCollider.ts#L45)

Lista de bindings GPU (uniform/storage buffers, texturas, samplers)
que este resource expõe ao `ResourceSystem`. Cada descriptor define
`id`, `role`, `schema` (StructSchema) e opcionalmente `storage`
(`'pool'` para coalescer N members do mesmo schema em 1 buffer).

#### Returns

readonly `GPUDescriptor`[]

#### Overrides

[`Collider`](Collider.md).[`getDescriptors`](Collider.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/physics/colliders/Collider.ts:16](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/colliders/Collider.ts#L16)

Pipelines GPU declaradas pelo resource (shader source + entry points
+ consumes). Útil para Materials que carregam shaders próprios.
Vazio para a maioria (Flows criam pipelines diretamente).

#### Returns

readonly `PipelineDescriptor`[]

#### Inherited from

[`Collider`](Collider.md).[`getPipelineDescriptors`](Collider.md#getpipelinedescriptors)
