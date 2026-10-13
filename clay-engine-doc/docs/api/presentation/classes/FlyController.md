[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / FlyController

# Class: FlyController

Defined in: [presentation/input/controllers/FlyController.ts:47](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/presentation/input/controllers/FlyController.ts#L47)

Voo livre: arrasto com o botão esquerdo gira (guinada/arfagem), WASD + E/Q movem em 3D. Componente da entidade da
câmera — muta só o `Transform` (posição e rotação).

## Extends

- [`InputDrivenController`](InputDrivenController.md)

## Constructors

### Constructor

> **new FlyController**(`options?`): `FlyController`

Defined in: [presentation/input/controllers/FlyController.ts:55](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/presentation/input/controllers/FlyController.ts#L55)

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

Defined in: [presentation/input/InputDrivenController.ts:20](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/presentation/input/InputDrivenController.ts#L20)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Inherited from

[`InputDrivenController`](InputDrivenController.md).[`state`](InputDrivenController.md#state)

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](../../elements/classes/Entity.md)[]

Defined in: [scene/contracts/Entity.ts:125](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/scene/contracts/Entity.ts#L125)

Lista somente-leitura dos filhos diretos. World.insert traverse essa
árvore recursivamente para coletar todos os Resources de um root.

##### Returns

readonly [`Entity`](../../elements/classes/Entity.md)[]

#### Inherited from

[`InputDrivenController`](InputDrivenController.md).[`attached`](InputDrivenController.md#attached)

***

### data

#### Get Signature

> **get** **data**(): `Record`\<`string`, `unknown`\>

Defined in: [scene/contracts/Entity.ts:88](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/scene/contracts/Entity.ts#L88)

Dados do Resource (o layout é o do schema dos descritores). Na cena, mutações de campo (`data.position = …`,
`data.position[0] = …`) e a reatribuição inteira (`data = …`) marcam o recurso para envio.

##### Returns

`Record`\<`string`, `unknown`\>

#### Set Signature

> **set** **data**(`next`): `void`

Defined in: [scene/contracts/Entity.ts:94](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/scene/contracts/Entity.ts#L94)

Troca o dado inteiro; na cena, o recurso inteiro é marcado para envio.

##### Parameters

###### next

`Record`\<`string`, `unknown`\>

##### Returns

`void`

#### Inherited from

[`InputDrivenController`](InputDrivenController.md).[`data`](InputDrivenController.md#data)

***

### rawData

#### Get Signature

> **get** `protected` **rawData**(): `Readonly`\<`Record`\<`string`, `unknown`\>\>

Defined in: [scene/contracts/Entity.ts:108](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/scene/contracts/Entity.ts#L108)

O dado cru, sem o proxy reativo — para leituras do próprio Resource (ex.: uma propriedade derivada consultada pelos
estágios) que não devem criar proxies aninhados. Escrever por aqui não marca o recurso.

##### Returns

`Readonly`\<`Record`\<`string`, `unknown`\>\>

#### Inherited from

[`InputDrivenController`](InputDrivenController.md).[`rawData`](InputDrivenController.md#rawdata)

## Methods

### add()

> **add**(`e`): `this`

Defined in: [scene/contracts/Entity.ts:116](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/scene/contracts/Entity.ts#L116)

Anexa uma Entity-filha. Retorna `this` para chaining fluente.
Não valida ciclos nem múltiplos pais — responsabilidade do caller.

#### Parameters

##### e

[`Entity`](../../elements/classes/Entity.md)

#### Returns

`this`

#### Inherited from

[`InputDrivenController`](InputDrivenController.md).[`add`](InputDrivenController.md#add)

***

### dispose()

> **dispose**(): `void`

Defined in: [presentation/input/InputDrivenController.ts:26](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/presentation/input/InputDrivenController.ts#L26)

Remove ouvintes de DOM que o controller registrou (chamado quando ele sai da cena). Default: no-op.

#### Returns

`void`

#### Inherited from

[`InputDrivenController`](InputDrivenController.md).[`dispose`](InputDrivenController.md#dispose)

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [presentation/input/InputDrivenController.ts:30](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/presentation/input/InputDrivenController.ts#L30)

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

Defined in: [presentation/input/InputDrivenController.ts:34](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/presentation/input/InputDrivenController.ts#L34)

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

Defined in: [presentation/input/controllers/FlyController.ts:65](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/presentation/input/controllers/FlyController.ts#L65)

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
