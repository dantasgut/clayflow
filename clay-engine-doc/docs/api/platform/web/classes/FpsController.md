[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / FpsController

# Class: FpsController

Defined in: [src/platform/web/input/FpsController.ts:23](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/input/FpsController.ts#L23)

Primeira pessoa: WASD anda no plano horizontal (altura dos olhos fixa); o olhar segue o ponteiro com o botão
esquerdo ou, com `canvas`, em pointer lock. Componente da entidade da câmera — muta só o `Transform`.

## Extends

- [`InputDrivenController`](../../../presentation/classes/InputDrivenController.md)\<`Record`\<`string`, `never`\>\>

## Constructors

### Constructor

> **new FpsController**(`options?`): `FpsController`

Defined in: [src/platform/web/input/FpsController.ts:32](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/input/FpsController.ts#L32)

#### Parameters

##### options?

[`FpsControllerOptions`](../interfaces/FpsControllerOptions.md) = `{}`

#### Returns

`FpsController`

#### Overrides

[`InputDrivenController`](../../../presentation/classes/InputDrivenController.md).[`constructor`](../../../presentation/classes/InputDrivenController.md#constructor)

## Properties

### state

> **state**: [`ResourceState`](../enumerations/ResourceState.md) = `ResourceState.Uninitialized`

Defined in: [src/presentation/input/InputDrivenController.ts:25](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/InputDrivenController.ts#L25)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Inherited from

[`InputDrivenController`](../../../presentation/classes/InputDrivenController.md).[`state`](../../../presentation/classes/InputDrivenController.md#state)

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](../../../elements/classes/Entity.md)\<`object`\>[]

Defined in: [src/scene/contracts/Entity.ts:160](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L160)

Lista somente-leitura dos filhos diretos. World.insert traverse essa
árvore recursivamente para coletar todos os Resources de um root.

##### Returns

readonly [`Entity`](../../../elements/classes/Entity.md)\<`object`\>[]

#### Inherited from

[`InputDrivenController`](../../../presentation/classes/InputDrivenController.md).[`attached`](../../../presentation/classes/InputDrivenController.md#attached)

***

### data

#### Get Signature

> **get** **data**(): `TData`

Defined in: [src/scene/contracts/Entity.ts:97](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L97)

Dados do Resource (o layout é o do schema dos descritores). Na cena, mutações de campo (`data.position = …`,
`data.position[0] = …`) e a reatribuição inteira (`data = …`) marcam o recurso para envio.

##### Returns

`TData`

#### Set Signature

> **set** **data**(`next`): `void`

Defined in: [src/scene/contracts/Entity.ts:103](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L103)

Troca o dado inteiro; na cena, o recurso inteiro é marcado para envio.

##### Parameters

###### next

`TData`

##### Returns

`void`

Dados runtime do resource (e.g. Camera position, Material albedo,
RigidBody mass). Schema é declarado em `getDescriptors()[i].schema`.
Mutações devem disparar evento `resourceDirty` para re-upload. O tipo
concreto vem do parâmetro de `Entity<TData>`; o motor lê os campos pelo
schema.

#### Inherited from

[`InputDrivenController`](../../../presentation/classes/InputDrivenController.md).[`data`](../../../presentation/classes/InputDrivenController.md#data)

***

### rawData

#### Get Signature

> **get** `protected` **rawData**(): `Readonly`\<`TData`\>

Defined in: [src/scene/contracts/Entity.ts:117](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L117)

O dado cru, sem o proxy reativo — para leituras do próprio Resource (ex.: uma propriedade derivada consultada pelos
estágios) que não devem criar proxies aninhados. Escrever por aqui não marca o recurso.

##### Returns

`Readonly`\<`TData`\>

#### Inherited from

[`InputDrivenController`](../../../presentation/classes/InputDrivenController.md).[`rawData`](../../../presentation/classes/InputDrivenController.md#rawdata)

## Methods

### add()

> **add**(`e`): `this`

Defined in: [src/scene/contracts/Entity.ts:140](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L140)

Anexa uma Entity-filha. Retorna `this` para chaining fluente.
Não valida ciclos nem múltiplos pais — responsabilidade do caller.

#### Parameters

##### e

[`Entity`](../../../elements/classes/Entity.md)\<`object`\>

#### Returns

`this`

#### Inherited from

[`InputDrivenController`](../../../presentation/classes/InputDrivenController.md).[`add`](../../../presentation/classes/InputDrivenController.md#add)

***

### detach()

> **detach**(`e`): `boolean`

Defined in: [src/scene/contracts/Entity.ts:149](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L149)

Desanexa uma Entity-filha direta (inverso de `add`). Devolve `false` se ela não é filha desta. Numa entidade já
inserida, use `World.detach` (que também atualiza a cena).

#### Parameters

##### e

[`Entity`](../../../elements/classes/Entity.md)\<`object`\>

#### Returns

`boolean`

#### Inherited from

[`InputDrivenController`](../../../presentation/classes/InputDrivenController.md).[`detach`](../../../presentation/classes/InputDrivenController.md#detach)

***

### dispose()

> **dispose**(): `void`

Defined in: [src/platform/web/input/FpsController.ts:43](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/input/FpsController.ts#L43)

Remove o ouvinte de clique (pointer lock) do canvas.

#### Returns

`void`

#### Overrides

[`InputDrivenController`](../../../presentation/classes/InputDrivenController.md).[`dispose`](../../../presentation/classes/InputDrivenController.md#dispose)

***

### getDescriptors()

> **getDescriptors**(): readonly [`GPUDescriptor`](../interfaces/GPUDescriptor.md)[]

Defined in: [src/presentation/input/InputDrivenController.ts:35](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/InputDrivenController.ts#L35)

Lista de bindings GPU (uniform/storage buffers, texturas, samplers)
que este resource expõe ao `ResourceSystem`. Cada descriptor define
`id`, `role`, `schema` (StructSchema) e opcionalmente `storage`
(`'pool'` para coalescer N members do mesmo schema em 1 buffer).

#### Returns

readonly [`GPUDescriptor`](../interfaces/GPUDescriptor.md)[]

#### Inherited from

[`InputDrivenController`](../../../presentation/classes/InputDrivenController.md).[`getDescriptors`](../../../presentation/classes/InputDrivenController.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly [`PipelineDescriptor`](../interfaces/PipelineDescriptor.md)[]

Defined in: [src/presentation/input/InputDrivenController.ts:39](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/InputDrivenController.ts#L39)

Pipelines GPU declaradas pelo resource (shader e entry points; recursos
pelos módulos declarados). Útil para Materials que carregam shaders próprios.
Vazio para a maioria (Flows criam pipelines diretamente).

#### Returns

readonly [`PipelineDescriptor`](../interfaces/PipelineDescriptor.md)[]

#### Inherited from

[`InputDrivenController`](../../../presentation/classes/InputDrivenController.md).[`getPipelineDescriptors`](../../../presentation/classes/InputDrivenController.md#getpipelinedescriptors)

***

### redescribe()

> `protected` **redescribe**(`previous`, `next`): `void`

Defined in: [src/scene/contracts/Entity.ts:127](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L127)

Troca o dado e os descritores em pool de uma vez — o Resource cujo layout depende do próprio dado (ex.: o registro
tipado de uma função de ponto quando a forma dos parâmetros muda; spec 031, R8). `getDescriptors()` já devolve os
novos; `previous` são os de antes. Fora da cena, só troca o dado; na cena, a C2 libera os slots nos pools antigos,
ocupa os dos novos com `next` e recompõe a entidade (`entitiesRecomposed`: registros e conjuntos dos estágios).

#### Parameters

##### previous

readonly [`GPUDescriptor`](../interfaces/GPUDescriptor.md)[]

##### next

`TData`

#### Returns

`void`

#### Inherited from

[`InputDrivenController`](../../../presentation/classes/InputDrivenController.md).[`redescribe`](../../../presentation/classes/InputDrivenController.md#redescribe)

***

### tick()

> **tick**(`input`, `dt`, `transform`): `void`

Defined in: [src/platform/web/input/FpsController.ts:51](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/web/input/FpsController.ts#L51)

Olha pelo ponteiro, anda pelas teclas e escreve posição e rotação no `Transform`.

#### Parameters

##### input

[`Input`](../../../presentation/classes/Input.md)

##### dt

`number`

##### transform

[`Transform`](../../../elements/classes/Transform.md)

#### Returns

`void`

#### Overrides

[`InputDrivenController`](../../../presentation/classes/InputDrivenController.md).[`tick`](../../../presentation/classes/InputDrivenController.md#tick)
