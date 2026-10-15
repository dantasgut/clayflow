[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / Camera

# Class: Camera

Defined in: [elements/scene/Camera.ts:68](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/scene/Camera.ts#L68)

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

- `Resource`

## Constructors

### Constructor

> **new Camera**(`values?`): `Camera`

Defined in: [elements/scene/Camera.ts:91](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/scene/Camera.ts#L91)

#### Parameters

##### values?

[`CameraValues`](../interfaces/CameraValues.md) = `{}`

#### Returns

`Camera`

#### Overrides

[`Entity`](Entity.md).[`constructor`](Entity.md#constructor)

## Properties

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/scene/Camera.ts:89](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/scene/Camera.ts#L89)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Implementation of

`Resource.state`

***

### matricesSchema

> `readonly` `static` **matricesSchema**: `StructSchema`

Defined in: [elements/scene/Camera.ts:82](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/scene/Camera.ts#L82)

Produto do `CameraFlow`, só na GPU (pool `CameraMatrices`, mesmo slot da câmera).

***

### schema

> `readonly` `static` **schema**: `StructSchema`

Defined in: [elements/scene/Camera.ts:70](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/scene/Camera.ts#L70)

Parâmetros de projeção (pool `Camera`). `projection`: 0 perspectiva, 1 ortográfica; `aspectMode`: 0 canvas, 1 fixo.

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](Entity.md)\<`object`\>[]

Defined in: [scene/contracts/Entity.ts:138](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/contracts/Entity.ts#L138)

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

#### Implementation of

`Resource.data`

#### Inherited from

[`Entity`](Entity.md).[`data`](Entity.md#data)

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

[`Entity`](Entity.md).[`rawData`](Entity.md#rawdata)

## Methods

### add()

> **add**(`e`): `this`

Defined in: [scene/contracts/Entity.ts:118](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/contracts/Entity.ts#L118)

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

### detach()

> **detach**(`e`): `boolean`

Defined in: [scene/contracts/Entity.ts:127](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/contracts/Entity.ts#L127)

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

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [elements/scene/Camera.ts:106](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/scene/Camera.ts#L106)

Parâmetros (CPU envia a cada mutação) + matrizes (produzidas só pela GPU).

#### Returns

readonly `GPUDescriptor`[]

#### Implementation of

`Resource.getDescriptors`

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/scene/Camera.ts:119](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/scene/Camera.ts#L119)

Pipelines GPU declaradas pelo resource (shader source + entry points
+ consumes). Útil para Materials que carregam shaders próprios.
Vazio para a maioria (Flows criam pipelines diretamente).

#### Returns

readonly `PipelineDescriptor`[]

#### Implementation of

`Resource.getPipelineDescriptors`
