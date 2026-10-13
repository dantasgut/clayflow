[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / FlyController

# Class: FlyController

Defined in: [presentation/input/controllers/FlyController.ts:47](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/input/controllers/FlyController.ts#L47)

Voo livre: arrasto com o botão esquerdo gira (guinada/arfagem), WASD + E/Q movem em 3D. Componente da entidade da
câmera — muta só o `Transform` (posição e rotação).

## Extends

- [`InputDrivenController`](InputDrivenController.md)\<`Record`\<`string`, `never`\>\>

## Constructors

### Constructor

> **new FlyController**(`options?`): `FlyController`

Defined in: [presentation/input/controllers/FlyController.ts:55](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/input/controllers/FlyController.ts#L55)

#### Parameters

##### options?

[`FlyControllerOptions`](../interfaces/FlyControllerOptions.md) = `{}`

#### Returns

`FlyController`

#### Overrides

[`InputDrivenController`](InputDrivenController.md).[`constructor`](InputDrivenController.md#constructor)

## Properties

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [presentation/input/InputDrivenController.ts:25](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/input/InputDrivenController.ts#L25)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Inherited from

[`InputDrivenController`](InputDrivenController.md).[`state`](InputDrivenController.md#state)

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](../../elements/classes/Entity.md)\<`object`\>[]

Defined in: [scene/contracts/Entity.ts:127](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/scene/contracts/Entity.ts#L127)

Lista somente-leitura dos filhos diretos. World.insert traverse essa
árvore recursivamente para coletar todos os Resources de um root.

##### Returns

readonly [`Entity`](../../elements/classes/Entity.md)\<`object`\>[]

#### Inherited from

[`InputDrivenController`](InputDrivenController.md).[`attached`](InputDrivenController.md#attached)

***

### data

#### Get Signature

> **get** **data**(): `TData`

Defined in: [scene/contracts/Entity.ts:90](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/scene/contracts/Entity.ts#L90)

Dados do Resource (o layout é o do schema dos descritores). Na cena, mutações de campo (`data.position = …`,
`data.position[0] = …`) e a reatribuição inteira (`data = …`) marcam o recurso para envio.

##### Returns

`TData`

#### Set Signature

> **set** **data**(`next`): `void`

Defined in: [scene/contracts/Entity.ts:96](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/scene/contracts/Entity.ts#L96)

Troca o dado inteiro; na cena, o recurso inteiro é marcado para envio.

##### Parameters

###### next

`TData`

##### Returns

`void`

#### Inherited from

[`InputDrivenController`](InputDrivenController.md).[`data`](InputDrivenController.md#data)

***

### rawData

#### Get Signature

> **get** `protected` **rawData**(): `Readonly`\<`TData`\>

Defined in: [scene/contracts/Entity.ts:110](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/scene/contracts/Entity.ts#L110)

O dado cru, sem o proxy reativo — para leituras do próprio Resource (ex.: uma propriedade derivada consultada pelos
estágios) que não devem criar proxies aninhados. Escrever por aqui não marca o recurso.

##### Returns

`Readonly`\<`TData`\>

#### Inherited from

[`InputDrivenController`](InputDrivenController.md).[`rawData`](InputDrivenController.md#rawdata)

## Methods

### add()

> **add**(`e`): `this`

Defined in: [scene/contracts/Entity.ts:118](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/scene/contracts/Entity.ts#L118)

Anexa uma Entity-filha. Retorna `this` para chaining fluente.
Não valida ciclos nem múltiplos pais — responsabilidade do caller.

#### Parameters

##### e

[`Entity`](../../elements/classes/Entity.md)\<`object`\>

#### Returns

`this`

#### Inherited from

[`InputDrivenController`](InputDrivenController.md).[`add`](InputDrivenController.md#add)

***

### dispose()

> **dispose**(): `void`

Defined in: [presentation/input/InputDrivenController.ts:31](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/input/InputDrivenController.ts#L31)

Remove ouvintes de DOM que o controller registrou (chamado quando ele sai da cena). Default: no-op.

#### Returns

`void`

#### Inherited from

[`InputDrivenController`](InputDrivenController.md).[`dispose`](InputDrivenController.md#dispose)

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [presentation/input/InputDrivenController.ts:35](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/input/InputDrivenController.ts#L35)

Lista de bindings GPU (uniform/storage buffers, texturas, samplers)
que este resource expõe ao `ResourceSystem`. Cada descriptor define
`id`, `role`, `schema` (StructSchema) e opcionalmente `storage`
(`'pool'` para coalescer N members do mesmo schema em 1 buffer).

#### Returns

readonly `GPUDescriptor`[]

#### Inherited from

[`InputDrivenController`](InputDrivenController.md).[`getDescriptors`](InputDrivenController.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [presentation/input/InputDrivenController.ts:39](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/input/InputDrivenController.ts#L39)

Pipelines GPU declaradas pelo resource (shader source + entry points
+ consumes). Útil para Materials que carregam shaders próprios.
Vazio para a maioria (Flows criam pipelines diretamente).

#### Returns

readonly `PipelineDescriptor`[]

#### Inherited from

[`InputDrivenController`](InputDrivenController.md).[`getPipelineDescriptors`](InputDrivenController.md#getpipelinedescriptors)

***

### tick()

> **tick**(`input`, `dt`, `transform`): `void`

Defined in: [presentation/input/controllers/FlyController.ts:65](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/presentation/input/controllers/FlyController.ts#L65)

Gira pelo arrasto, move pelas teclas e escreve posição e rotação no `Transform`.

#### Parameters

##### input

[`Input`](Input.md)

##### dt

`number`

##### transform

[`Transform`](../../elements/classes/Transform.md)

#### Returns

`void`

#### Overrides

[`InputDrivenController`](InputDrivenController.md).[`tick`](InputDrivenController.md#tick)
