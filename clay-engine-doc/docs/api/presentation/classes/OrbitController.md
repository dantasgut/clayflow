[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / OrbitController

# Class: OrbitController

Defined in: [presentation/input/controllers/OrbitController.ts:29](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/input/controllers/OrbitController.ts#L29)

OrbitController com damping (inércia) por canal: theta, phi, distance. Cada canal acumula a velocidade do arrasto,
da roda ou da pinça e decai depois que o usuário solta. Componente da entidade da câmera: a cada quadro posiciona o
`Transform` na esfera em torno do alvo e o orienta para ele (`Transform.lookRotation`).

## Extends

- [`InputDrivenController`](InputDrivenController.md)\<`Record`\<`string`, `never`\>\>

## Constructors

### Constructor

> **new OrbitController**(`options?`): `OrbitController`

Defined in: [presentation/input/controllers/OrbitController.ts:42](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/input/controllers/OrbitController.ts#L42)

#### Parameters

##### options?

[`OrbitControllerOptions`](../interfaces/OrbitControllerOptions.md) = `{}`

#### Returns

`OrbitController`

#### Overrides

[`InputDrivenController`](InputDrivenController.md).[`constructor`](InputDrivenController.md#constructor)

## Properties

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [presentation/input/InputDrivenController.ts:25](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/input/InputDrivenController.ts#L25)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Inherited from

[`InputDrivenController`](InputDrivenController.md).[`state`](InputDrivenController.md#state)

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](../../elements/classes/Entity.md)\<`object`\>[]

Defined in: [scene/contracts/Entity.ts:138](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/contracts/Entity.ts#L138)

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

Defined in: [scene/contracts/Entity.ts:90](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/contracts/Entity.ts#L90)

Dados do Resource (o layout é o do schema dos descritores). Na cena, mutações de campo (`data.position = …`,
`data.position[0] = …`) e a reatribuição inteira (`data = …`) marcam o recurso para envio.

##### Returns

`TData`

#### Set Signature

> **set** **data**(`next`): `void`

Defined in: [scene/contracts/Entity.ts:96](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/contracts/Entity.ts#L96)

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

Defined in: [scene/contracts/Entity.ts:110](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/contracts/Entity.ts#L110)

O dado cru, sem o proxy reativo — para leituras do próprio Resource (ex.: uma propriedade derivada consultada pelos
estágios) que não devem criar proxies aninhados. Escrever por aqui não marca o recurso.

##### Returns

`Readonly`\<`TData`\>

#### Inherited from

[`InputDrivenController`](InputDrivenController.md).[`rawData`](InputDrivenController.md#rawdata)

## Methods

### add()

> **add**(`e`): `this`

Defined in: [scene/contracts/Entity.ts:118](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/contracts/Entity.ts#L118)

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

### detach()

> **detach**(`e`): `boolean`

Defined in: [scene/contracts/Entity.ts:127](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/contracts/Entity.ts#L127)

Desanexa uma Entity-filha direta (inverso de `add`). Devolve `false` se ela não é filha desta. Numa entidade já
inserida, use `World.detach` (que também atualiza a cena).

#### Parameters

##### e

[`Entity`](../../elements/classes/Entity.md)\<`object`\>

#### Returns

`boolean`

#### Inherited from

[`InputDrivenController`](InputDrivenController.md).[`detach`](InputDrivenController.md#detach)

***

### dispose()

> **dispose**(): `void`

Defined in: [presentation/input/InputDrivenController.ts:31](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/input/InputDrivenController.ts#L31)

Remove ouvintes de DOM que o controller registrou (chamado quando ele sai da cena). Default: no-op.

#### Returns

`void`

#### Inherited from

[`InputDrivenController`](InputDrivenController.md).[`dispose`](InputDrivenController.md#dispose)

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [presentation/input/InputDrivenController.ts:35](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/input/InputDrivenController.ts#L35)

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

Defined in: [presentation/input/InputDrivenController.ts:39](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/input/InputDrivenController.ts#L39)

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

Defined in: [presentation/input/controllers/OrbitController.ts:53](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/presentation/input/controllers/OrbitController.ts#L53)

Integra arrasto, roda e pinça com damping e reposiciona o `Transform` da câmera em órbita do alvo.

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
