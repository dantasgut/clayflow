[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / DragField

# Class: DragField

Defined in: [elements/physics/forcefields/DragField.ts:22](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/forcefields/DragField.ts#L22)

Campo de arrasto — frenagem proporcional à velocidade (linear + quadrática).
F = -linear·v - quadratic·|v|·v. Simula resistência ao ar/fluido.

## Extends

- [`ForceField`](ForceField.md)\<[`DragFieldData`](../interfaces/DragFieldData.md)\>

## Constructors

### Constructor

> **new DragField**(`values?`): `DragField`

Defined in: [elements/physics/forcefields/DragField.ts:31](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/forcefields/DragField.ts#L31)

#### Parameters

##### values?

`Partial`\<[`DragFieldData`](../interfaces/DragFieldData.md)\> = `{}`

#### Returns

`DragField`

#### Overrides

[`ForceField`](ForceField.md).[`constructor`](ForceField.md#constructor)

## Properties

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/physics/forcefields/ForceField.ts:43](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/forcefields/ForceField.ts#L43)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Inherited from

[`ForceField`](ForceField.md).[`state`](ForceField.md#state)

***

### recordDescriptor

> `protected` `readonly` `static` **recordDescriptor**: `GPUDescriptor`

Defined in: [elements/physics/forcefields/ForceField.ts:46](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/forcefields/ForceField.ts#L46)

Descritor do registro no pool comum dos campos.

#### Inherited from

[`ForceField`](ForceField.md).[`recordDescriptor`](ForceField.md#recorddescriptor)

***

### schema

> `readonly` `static` **schema**: `StructSchema`

Defined in: [elements/physics/forcefields/DragField.ts:24](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/forcefields/DragField.ts#L24)

StructSchema do DragField (linearCoeff + quadraticCoeff).

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

[`ForceField`](ForceField.md).[`attached`](ForceField.md#attached)

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

[`ForceField`](ForceField.md).[`data`](ForceField.md#data)

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

[`ForceField`](ForceField.md).[`rawData`](ForceField.md#rawdata)

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

[`ForceField`](ForceField.md).[`add`](ForceField.md#add)

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

[`ForceField`](ForceField.md).[`detach`](ForceField.md#detach)

***

### fieldRecord()

> `protected` **fieldRecord**(`d`): [`FieldRecordValues`](../interfaces/FieldRecordValues.md)

Defined in: [elements/physics/forcefields/DragField.ts:46](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/forcefields/DragField.ts#L46)

Arrasto (spec 009): aceleração −(linear + quadrático · |v|) · v.

#### Parameters

##### d

`Readonly`\<[`DragFieldData`](../interfaces/DragFieldData.md)\>

#### Returns

[`FieldRecordValues`](../interfaces/FieldRecordValues.md)

#### Overrides

[`ForceField`](ForceField.md).[`fieldRecord`](ForceField.md#fieldrecord)

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [elements/physics/forcefields/DragField.ts:41](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/forcefields/DragField.ts#L41)

Lista de bindings GPU (uniform/storage buffers, texturas, samplers)
que este resource expõe ao `ResourceSystem`. Cada descriptor define
`id`, `role`, `schema` (StructSchema) e opcionalmente `storage`
(`'pool'` para coalescer N members do mesmo schema em 1 buffer).

#### Returns

readonly `GPUDescriptor`[]

#### Overrides

[`ForceField`](ForceField.md).[`getDescriptors`](ForceField.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/physics/forcefields/ForceField.ts:55](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/forcefields/ForceField.ts#L55)

Pipelines GPU declaradas pelo resource (shader source + entry points
+ consumes). Útil para Materials que carregam shaders próprios.
Vazio para a maioria (Flows criam pipelines diretamente).

#### Returns

readonly `PipelineDescriptor`[]

#### Inherited from

[`ForceField`](ForceField.md).[`getPipelineDescriptors`](ForceField.md#getpipelinedescriptors)

***

### withRecord()

> `protected` **withRecord**(`data`): [`DragFieldData`](../interfaces/DragFieldData.md)

Defined in: [elements/physics/forcefields/ForceField.ts:66](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/forcefields/ForceField.ts#L66)

`data` com os campos do registro (`v0`–`v7`, `revision`, `kind`, preenchimentos) como getters derivados de
`fieldRecord` — o envio do pool lê os valores atuais.

#### Parameters

##### data

[`DragFieldData`](../interfaces/DragFieldData.md)

#### Returns

[`DragFieldData`](../interfaces/DragFieldData.md)

#### Inherited from

[`ForceField`](ForceField.md).[`withRecord`](ForceField.md#withrecord)
