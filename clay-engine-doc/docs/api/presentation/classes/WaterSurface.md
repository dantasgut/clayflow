[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / WaterSurface

# Class: WaterSurface

Defined in: [presentation/app/WaterSurface.ts:34](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/app/WaterSurface.ts#L34)

Superfície de água da cena (Camada 4, spec 017): as texturas que os estágios da água compartilham — a superfície
genérica (profundidade linear suavizada, espessura e material por pixel) nas vistas da câmera e da luz, a cópia da
cena antes da água (fonte da refração), o enquadramento da vista da luz (matriz ajustada à água, produzida na GPU),
o mapa de cáusticas e os acumuladores de fótons.

Quem produz a superfície (hoje o `FluidSurfaceFlow`, a partir das partículas; depois a água por altura da spec 029)
escreve `depth`/`thickness`/`material` e `lightDepth`/`lightMaterial`; quem consome (`CausticsFlow`, `WaterFlow`) não
sabe a origem. Todos os descritores são alocados sob demanda (`allocation: 'onDemand'`): o produtor pede a alocação
quando a primeira água entra; sem água, nada ocupa memória. As texturas da vista da câmera têm o tamanho do canvas e
são recriadas pela C2 com ele. Uma por cena, inserida pelos estágios padrão.

## Extends

- [`Entity`](../../elements/classes/Entity.md)\<`Record`\<`string`, `never`\>\>

## Implements

- `Resource`

## Constructors

### Constructor

> **new WaterSurface**(`options?`): `WaterSurface`

Defined in: [presentation/app/WaterSurface.ts:42](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/app/WaterSurface.ts#L42)

#### Parameters

##### options?

[`WaterSurfaceOptions`](../interfaces/WaterSurfaceOptions.md) = `{}`

#### Returns

`WaterSurface`

#### Overrides

[`Entity`](../../elements/classes/Entity.md).[`constructor`](../../elements/classes/Entity.md#constructor)

## Properties

### lightSize

> `readonly` **lightSize**: `number`

Defined in: [presentation/app/WaterSurface.ts:40](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/app/WaterSurface.ts#L40)

Resolução da vista da luz e das cáusticas.

***

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [presentation/app/WaterSurface.ts:38](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/app/WaterSurface.ts#L38)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Implementation of

`Resource.state`

***

### schema

> `readonly` `static` **schema**: `StructSchema`

Defined in: [presentation/app/WaterSurface.ts:36](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/app/WaterSurface.ts#L36)

Identidade da superfície na cena (o World indexa pelo schema da classe); sem dados de GPU próprios.

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](../../elements/classes/Entity.md)\<`object`\>[]

Defined in: [scene/contracts/Entity.ts:138](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/contracts/Entity.ts#L138)

Lista somente-leitura dos filhos diretos. World.insert traverse essa
árvore recursivamente para coletar todos os Resources de um root.

##### Returns

readonly [`Entity`](../../elements/classes/Entity.md)\<`object`\>[]

#### Inherited from

[`Entity`](../../elements/classes/Entity.md).[`attached`](../../elements/classes/Entity.md#attached)

***

### data

#### Get Signature

> **get** **data**(): `TData`

Defined in: [scene/contracts/Entity.ts:90](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/contracts/Entity.ts#L90)

Dados do Resource (o layout é o do schema dos descritores). Na cena, mutações de campo (`data.position = …`,
`data.position[0] = …`) e a reatribuição inteira (`data = …`) marcam o recurso para envio.

##### Returns

`TData`

#### Set Signature

> **set** **data**(`next`): `void`

Defined in: [scene/contracts/Entity.ts:96](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/contracts/Entity.ts#L96)

Troca o dado inteiro; na cena, o recurso inteiro é marcado para envio.

##### Parameters

###### next

`TData`

##### Returns

`void`

#### Implementation of

`Resource.data`

#### Inherited from

[`Entity`](../../elements/classes/Entity.md).[`data`](../../elements/classes/Entity.md#data)

***

### rawData

#### Get Signature

> **get** `protected` **rawData**(): `Readonly`\<`TData`\>

Defined in: [scene/contracts/Entity.ts:110](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/contracts/Entity.ts#L110)

O dado cru, sem o proxy reativo — para leituras do próprio Resource (ex.: uma propriedade derivada consultada pelos
estágios) que não devem criar proxies aninhados. Escrever por aqui não marca o recurso.

##### Returns

`Readonly`\<`TData`\>

#### Inherited from

[`Entity`](../../elements/classes/Entity.md).[`rawData`](../../elements/classes/Entity.md#rawdata)

## Methods

### add()

> **add**(`e`): `this`

Defined in: [scene/contracts/Entity.ts:118](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/contracts/Entity.ts#L118)

Anexa uma Entity-filha. Retorna `this` para chaining fluente.
Não valida ciclos nem múltiplos pais — responsabilidade do caller.

#### Parameters

##### e

[`Entity`](../../elements/classes/Entity.md)\<`object`\>

#### Returns

`this`

#### Inherited from

[`Entity`](../../elements/classes/Entity.md).[`add`](../../elements/classes/Entity.md#add)

***

### detach()

> **detach**(`e`): `boolean`

Defined in: [scene/contracts/Entity.ts:127](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/contracts/Entity.ts#L127)

Desanexa uma Entity-filha direta (inverso de `add`). Devolve `false` se ela não é filha desta. Numa entidade já
inserida, use `World.detach` (que também atualiza a cena).

#### Parameters

##### e

[`Entity`](../../elements/classes/Entity.md)\<`object`\>

#### Returns

`boolean`

#### Inherited from

[`Entity`](../../elements/classes/Entity.md).[`detach`](../../elements/classes/Entity.md#detach)

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [presentation/app/WaterSurface.ts:69](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/app/WaterSurface.ts#L69)

Lista de bindings GPU (uniform/storage buffers, texturas, samplers)
que este resource expõe ao `ResourceSystem`. Cada descriptor define
`id`, `role`, `schema` (StructSchema) e opcionalmente `storage`
(`'pool'` para coalescer N members do mesmo schema em 1 buffer).

#### Returns

readonly `GPUDescriptor`[]

#### Implementation of

`Resource.getDescriptors`

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [presentation/app/WaterSurface.ts:144](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/app/WaterSurface.ts#L144)

Pipelines GPU declaradas pelo resource (shader source + entry points
+ consumes). Útil para Materials que carregam shaders próprios.
Vazio para a maioria (Flows criam pipelines diretamente).

#### Returns

readonly `PipelineDescriptor`[]

#### Implementation of

`Resource.getPipelineDescriptors`

***

### isProduced()

> **isProduced**(`view`): `boolean`

Defined in: [presentation/app/WaterSurface.ts:65](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/app/WaterSurface.ts#L65)

A superfície da `view` foi produzida neste quadro?

#### Parameters

##### view

`"camera"` \| `"light"`

#### Returns

`boolean`

***

### markProduced()

> **markProduced**(`view`, `produced`): `void`

Defined in: [presentation/app/WaterSurface.ts:60](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/app/WaterSurface.ts#L60)

Um produtor declara se escreveu a superfície da `view` neste quadro (em `framePrepare`, antes da gravação). Os
consumidores (`WaterFlow`, `CausticsFlow`, o forward) só gravam com a vista produzida.

#### Parameters

##### view

`"camera"` \| `"light"`

##### produced

`boolean`

#### Returns

`void`
