[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / Transform

# Class: Transform

Defined in: [elements/scene/Transform.ts:32](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/elements/scene/Transform.ts#L32)

Transform 3D — a **intenção** de posicionamento de um objeto: posição, rotação
(quaternion) e escala. Mutar `data` depois de inserir reposiciona o objeto no
quadro seguinte, sem chamadas manuais.

A matriz de mundo não é dado do desenvolvedor: é produzida na GPU pelo
`TransformFlow` (fase `transform`) num segundo descritor do mesmo recurso
(`WorldTransform`, mesmo slot), e lida pelos estágios de sombra e desenho.

Mudança incompatível: o antigo campo `model` foi removido — ver o guia de migração.

## Extends

- [`Entity`](Entity.md)

## Implements

- `Resource`

## Constructors

### Constructor

> **new Transform**(`values?`): `Transform`

Defined in: [elements/scene/Transform.ts:52](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/elements/scene/Transform.ts#L52)

#### Parameters

##### values?

[`TransformValues`](../interfaces/TransformValues.md) = `{}`

#### Returns

`Transform`

#### Overrides

[`Entity`](Entity.md).[`constructor`](Entity.md#constructor)

## Properties

### data

> **data**: `Record`\<`string`, `unknown`\> = `{}`

Defined in: [elements/scene/Transform.ts:50](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/elements/scene/Transform.ts#L50)

Dados runtime do resource (e.g. Camera position, Material albedo,
RigidBody mass). Schema é declarado em `getDescriptors()[i].schema`.
Mutações devem disparar evento `resourceDirty` para re-upload.

#### Implementation of

`Resource.data`

***

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/scene/Transform.ts:49](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/elements/scene/Transform.ts#L49)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Implementation of

`Resource.state`

***

### schema

> `readonly` `static` **schema**: `StructSchema`

Defined in: [elements/scene/Transform.ts:34](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/elements/scene/Transform.ts#L34)

Intenção do desenvolvedor: posição, rotação e escala (pool `Transform`).

***

### worldSchema

> `readonly` `static` **worldSchema**: `StructSchema`

Defined in: [elements/scene/Transform.ts:44](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/elements/scene/Transform.ts#L44)

Produto do estágio de transformação, só na GPU (pool `WorldTransform`):
`world = T·R·S` e `normal = R·S⁻¹` (matriz para normais).

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](Entity.md)[]

Defined in: [scene/contracts/Entity.ts:41](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/scene/contracts/Entity.ts#L41)

Lista somente-leitura dos filhos diretos. World.insert traverse essa
árvore recursivamente para coletar todos os Resources de um root.

##### Returns

readonly [`Entity`](Entity.md)[]

#### Inherited from

[`Entity`](Entity.md).[`attached`](Entity.md#attached)

## Methods

### add()

> **add**(`e`): `this`

Defined in: [scene/contracts/Entity.ts:32](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/scene/contracts/Entity.ts#L32)

Anexa uma Entity-filha. Retorna `this` para chaining fluente.
Não valida ciclos nem múltiplos pais — responsabilidade do caller.

#### Parameters

##### e

[`Entity`](Entity.md)

#### Returns

`this`

#### Inherited from

[`Entity`](Entity.md).[`add`](Entity.md#add)

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [elements/scene/Transform.ts:63](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/elements/scene/Transform.ts#L63)

Intenção (CPU envia a cada mutação) + matriz de mundo (produzida só pela GPU).

#### Returns

readonly `GPUDescriptor`[]

#### Implementation of

`Resource.getDescriptors`

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/scene/Transform.ts:82](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/elements/scene/Transform.ts#L82)

Pipelines GPU declaradas pelo resource (shader source + entry points
+ consumes). Útil para Materials que carregam shaders próprios.
Vazio para a maioria (Flows criam pipelines diretamente).

#### Returns

readonly `PipelineDescriptor`[]

#### Implementation of

`Resource.getPipelineDescriptors`

***

### resetLegacyModelWarning()

> `static` **resetLegacyModelWarning**(): `void`

Defined in: [elements/scene/Transform.ts:87](https://github.com/dantasgut/clayflow/blob/19722869f2426edabbb969d3f2b98da711a4ae3c/src/elements/scene/Transform.ts#L87)

Reabilita o aviso de `model` legado (uso em testes).

#### Returns

`void`
