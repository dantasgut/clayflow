[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / Camera

# Class: Camera

Defined in: [src/elements/scene/Camera.ts:71](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/Camera.ts#L71)

Câmera — os **parâmetros** de projeção (spec 007). Posição e orientação vêm do `Transform` da mesma entidade
(obrigatório: a câmera olha para −Z local; `Transform.lookRotation` mira um ponto); os controllers mutam esse
`Transform`. View, projection e viewProjection são produzidas na GPU pelo `CameraFlow`, num segundo descritor do
mesmo recurso (pool `CameraMatrices`, mesmo slot), que o render principal lê.

```ts
const camera = new Camera({ fov: Math.PI / 4 });
camera.add(new Transform({ position: [0, 3, 6, 1], rotation: Transform.lookRotation([0, 3, 6], [0, 0, 0]) }));
app.world.insert(camera);
```

Mudança incompatível: as matrizes (`view`, `projection`, `viewProjection`, `position`) não são mais dado da câmera
— ver o guia de migração.

## Extends

- [`Entity`](Entity.md)\<[`CameraData`](../interfaces/CameraData.md)\>

## Implements

- [`Resource`](../../platform/web/interfaces/Resource.md)

## Constructors

### Constructor

> **new Camera**(`values?`): `Camera`

Defined in: [src/elements/scene/Camera.ts:114](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/Camera.ts#L114)

#### Parameters

##### values?

[`CameraValues`](../interfaces/CameraValues.md) = `{}`

#### Returns

`Camera`

#### Overrides

[`Entity`](Entity.md).[`constructor`](Entity.md#constructor)

## Properties

### state

> **state**: [`ResourceState`](../../platform/web/enumerations/ResourceState.md) = `ResourceState.Uninitialized`

Defined in: [src/elements/scene/Camera.ts:112](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/Camera.ts#L112)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Implementation of

[`Resource`](../../platform/web/interfaces/Resource.md).[`state`](../../platform/web/interfaces/Resource.md#state)

***

### matricesSchema

> `readonly` `static` **matricesSchema**: [`StructSchema`](../../platform/web/classes/StructSchema.md)

Defined in: [src/elements/scene/Camera.ts:85](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/Camera.ts#L85)

Produto do `CameraFlow`, só na GPU (pool `CameraMatrices`, mesmo slot da câmera).

***

### schema

> `readonly` `static` **schema**: [`StructSchema`](../../platform/web/classes/StructSchema.md)

Defined in: [src/elements/scene/Camera.ts:73](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/Camera.ts#L73)

Parâmetros de projeção (pool `Camera`). `projection`: 0 perspectiva, 1 ortográfica; `aspectMode`: 0 canvas, 1 fixo.

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](Entity.md)\<`object`\>[]

Defined in: [src/scene/contracts/Entity.ts:160](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L160)

Lista somente-leitura dos filhos diretos. World.insert traverse essa
árvore recursivamente para coletar todos os Resources de um root.

##### Returns

readonly [`Entity`](Entity.md)\<`object`\>[]

#### Inherited from

[`Entity`](Entity.md).[`attached`](Entity.md#attached)

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

#### Implementation of

[`Resource`](../../platform/web/interfaces/Resource.md).[`data`](../../platform/web/interfaces/Resource.md#data)

#### Inherited from

[`Entity`](Entity.md).[`data`](Entity.md#data)

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

[`Entity`](Entity.md).[`rawData`](Entity.md#rawdata)

## Methods

### add()

> **add**(`e`): `this`

Defined in: [src/scene/contracts/Entity.ts:140](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L140)

Anexa uma Entity-filha. Retorna `this` para chaining fluente.
Não valida ciclos nem múltiplos pais — responsabilidade do caller.

#### Parameters

##### e

[`Entity`](Entity.md)\<`object`\>

#### Returns

`this`

#### Inherited from

[`Entity`](Entity.md).[`add`](Entity.md#add)

***

### cut()

> **cut**(): `void`

Defined in: [src/elements/scene/Camera.ts:132](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/Camera.ts#L132)

Corte de câmera (spec 034): o próximo quadro não continua o anterior — o antisserrilhado temporal, a luz de tela e a
névoa descartam o histórico nele. Use ao teletransportar a câmera ou trocar de plano.

#### Returns

`void`

***

### detach()

> **detach**(`e`): `boolean`

Defined in: [src/scene/contracts/Entity.ts:149](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L149)

Desanexa uma Entity-filha direta (inverso de `add`). Devolve `false` se ela não é filha desta. Numa entidade já
inserida, use `World.detach` (que também atualiza a cena).

#### Parameters

##### e

[`Entity`](Entity.md)\<`object`\>

#### Returns

`boolean`

#### Inherited from

[`Entity`](Entity.md).[`detach`](Entity.md#detach)

***

### getDescriptors()

> **getDescriptors**(): readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

Defined in: [src/elements/scene/Camera.ts:137](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/Camera.ts#L137)

Parâmetros (CPU envia a cada mutação) + matrizes (produzidas só pela GPU).

#### Returns

readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

#### Implementation of

[`Resource`](../../platform/web/interfaces/Resource.md).[`getDescriptors`](../../platform/web/interfaces/Resource.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly [`PipelineDescriptor`](../../platform/web/interfaces/PipelineDescriptor.md)[]

Defined in: [src/elements/scene/Camera.ts:150](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/Camera.ts#L150)

Pipelines GPU declaradas pelo resource (shader e entry points; recursos
pelos módulos declarados). Útil para Materials que carregam shaders próprios.
Vazio para a maioria (Flows criam pipelines diretamente).

#### Returns

readonly [`PipelineDescriptor`](../../platform/web/interfaces/PipelineDescriptor.md)[]

#### Implementation of

[`Resource`](../../platform/web/interfaces/Resource.md).[`getPipelineDescriptors`](../../platform/web/interfaces/Resource.md#getpipelinedescriptors)

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

readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

##### next

[`CameraData`](../interfaces/CameraData.md)

#### Returns

`void`

#### Inherited from

[`Entity`](Entity.md).[`redescribe`](Entity.md#redescribe)
