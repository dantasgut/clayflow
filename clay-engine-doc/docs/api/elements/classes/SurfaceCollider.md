[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / SurfaceCollider

# Class: SurfaceCollider

Defined in: [elements/physics/colliders/SurfaceCollider.ts:91](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/colliders/SurfaceCollider.ts#L91)

Colisor derivado de uma superfície paramétrica (spec 010): anexado à entidade da `ParametricSurface`, o
`SurfaceColliderFlow` constrói na GPU um campo de alturas (`'height'`, terreno) ou de distâncias com sinal
(`'distance'`, superfície geral) a partir da mesma função que desenha a superfície, com o espaço da cena e a
transformação da entidade. Corpos rígidos, fluidos, corpos moles e emissores colidem com ele pela fronteira comum
(`ColliderHit`), adesão da 030 inclusive. Unilateral: a superfície não é empurrada.

Quando a superfície anima, há uma cópia do campo por passo fixo do quadro (mesma trajetória a 30/60/144 Hz).

## Extends

- [`Collider`](Collider.md)\<[`SurfaceColliderData`](../interfaces/SurfaceColliderData.md)\>

## Constructors

### Constructor

> **new SurfaceCollider**(`options?`): `SurfaceCollider`

Defined in: [elements/physics/colliders/SurfaceCollider.ts:114](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/colliders/SurfaceCollider.ts#L114)

#### Parameters

##### options?

[`SurfaceColliderOptions`](../interfaces/SurfaceColliderOptions.md) = `{}`

#### Returns

`SurfaceCollider`

#### Overrides

[`Collider`](Collider.md).[`constructor`](Collider.md#constructor)

## Properties

### sampling

> `readonly` **sampling**: readonly \[`number`, `number`\]

Defined in: [elements/physics/colliders/SurfaceCollider.ts:112](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/colliders/SurfaceCollider.ts#L112)

Resolução `[nu, nv]` da grade de avaliação da superfície.

***

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/physics/colliders/Collider.ts:12](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/colliders/Collider.ts#L12)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Inherited from

[`Collider`](Collider.md).[`state`](Collider.md#state)

***

### cellSchema

> `readonly` `static` **cellSchema**: `StructSchema`

Defined in: [elements/physics/colliders/SurfaceCollider.ts:109](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/colliders/SurfaceCollider.ts#L109)

Célula do campo (pool `field`; cabeçalho e valores, um `f32` por slot).

***

### schema

> `readonly` `static` **schema**: `StructSchema`

Defined in: [elements/physics/colliders/SurfaceCollider.ts:93](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/colliders/SurfaceCollider.ts#L93)

Registro do colisor (pool `collider` do tipo superfície).

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

[`Collider`](Collider.md).[`attached`](Collider.md#attached)

***

### cellCount

#### Get Signature

> **get** **cellCount**(): `number`

Defined in: [elements/physics/colliders/SurfaceCollider.ts:156](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/colliders/SurfaceCollider.ts#L156)

Células do campo (uma cópia).

##### Returns

`number`

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

[`Collider`](Collider.md).[`data`](Collider.md#data)

***

### mode

#### Get Signature

> **get** **mode**(): [`SurfaceColliderMode`](../type-aliases/SurfaceColliderMode.md)

Defined in: [elements/physics/colliders/SurfaceCollider.ts:151](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/colliders/SurfaceCollider.ts#L151)

Modo do colisor.

##### Returns

[`SurfaceColliderMode`](../type-aliases/SurfaceColliderMode.md)

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

[`Collider`](Collider.md).[`rawData`](Collider.md#rawdata)

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

[`Collider`](Collider.md).[`add`](Collider.md#add)

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

[`Collider`](Collider.md).[`detach`](Collider.md#detach)

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [elements/physics/colliders/SurfaceCollider.ts:161](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/colliders/SurfaceCollider.ts#L161)

Registro (pool `collider`) e campo (pool `field`, produzido pela GPU) com as cópias.

#### Returns

readonly `GPUDescriptor`[]

#### Overrides

[`Collider`](Collider.md).[`getDescriptors`](Collider.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/physics/colliders/Collider.ts:16](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/colliders/Collider.ts#L16)

Pipelines GPU declaradas pelo resource (shader source + entry points
+ consumes). Útil para Materials que carregam shaders próprios.
Vazio para a maioria (Flows criam pipelines diretamente).

#### Returns

readonly `PipelineDescriptor`[]

#### Inherited from

[`Collider`](Collider.md).[`getPipelineDescriptors`](Collider.md#getpipelinedescriptors)
