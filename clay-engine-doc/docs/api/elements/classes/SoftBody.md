[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / SoftBody

# Class: SoftBody

Defined in: [src/elements/physics/bodies/SoftBody.ts:118](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/bodies/SoftBody.ts#L118)

SoftBody — um corpo deformável (tecido, gelatina, malha FEM) de N partículas num único Resource (spec 008), na faixa
de N slots do pool do algoritmo (`XPBDSoftSchema`, `FEMSchema`, `MPMSoftSchema`), que roteia para o `XPBDFlow`,
`FEMFlow` ou `MPMFlow`. No XPBD, `edges` são restrições de distância do próprio corpo, numa faixa do pool
`DistanceConstraint` (índices locais; a C2 soma o início da faixa das partículas).

 - **Domínio**: `new SoftBody({ algorithm: 'XPBD', position, mass, edges })`.
 - **Cru** (avançado): `new SoftBody({ schema, count, data })`.

## Extends

- [`ParticleBody`](ParticleBody.md)\<[`SoftBodyData`](../interfaces/SoftBodyData.md)\>

## Constructors

### Constructor

> **new SoftBody**(`options`): `SoftBody`

Defined in: [src/elements/physics/bodies/SoftBody.ts:128](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/bodies/SoftBody.ts#L128)

#### Parameters

##### options

[`SoftBodyOptions`](../type-aliases/SoftBodyOptions.md)

#### Returns

`SoftBody`

#### Overrides

[`ParticleBody`](ParticleBody.md).[`constructor`](ParticleBody.md#constructor)

## Properties

### algorithm

> `readonly` **algorithm**: [`SoftBodyAlgorithm`](../type-aliases/SoftBodyAlgorithm.md) \| `undefined`

Defined in: [src/elements/physics/bodies/SoftBody.ts:124](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/bodies/SoftBody.ts#L124)

Algoritmo do corpo (pelo schema das partículas), ou `undefined` num corpo cru de outro schema.

***

### count

> `readonly` **count**: `number`

Defined in: [src/elements/physics/bodies/ParticleBody.ts:39](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/bodies/ParticleBody.ts#L39)

Número de partículas.

#### Inherited from

[`ParticleBody`](ParticleBody.md).[`count`](ParticleBody.md#count)

***

### edgeColors

> `readonly` **edgeColors**: `number` = `0`

Defined in: [src/elements/physics/bodies/SoftBody.ts:126](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/bodies/SoftBody.ts#L126)

Cores das arestas (spec 034, T061b): os despachos de cor que o solver precisa para este corpo (0 sem arestas).

***

### edgeCount

> `readonly` **edgeCount**: `number`

Defined in: [src/elements/physics/bodies/SoftBody.ts:120](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/bodies/SoftBody.ts#L120)

Número de arestas (restrições de distância internas).

***

### particleSchema

> `readonly` **particleSchema**: [`StructSchema`](../../platform/web/classes/StructSchema.md)

Defined in: [src/elements/physics/bodies/ParticleBody.ts:41](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/bodies/ParticleBody.ts#L41)

Schema do struct da partícula (o do pool).

#### Inherited from

[`ParticleBody`](ParticleBody.md).[`particleSchema`](ParticleBody.md#particleschema)

***

### state

> **state**: [`ResourceState`](../../platform/web/enumerations/ResourceState.md) = `ResourceState.Uninitialized`

Defined in: [src/elements/physics/bodies/PhysicsBody.ts:19](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/bodies/PhysicsBody.ts#L19)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Inherited from

[`ParticleBody`](ParticleBody.md).[`state`](ParticleBody.md#state)

***

### surface

> `readonly` **surface**: [`SurfaceGeometry`](SurfaceGeometry.md) \| `undefined` = `undefined`

Defined in: [src/elements/physics/bodies/SoftBody.ts:122](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/bodies/SoftBody.ts#L122)

Superfície desenhada como malha, se declarada (parte do corpo).

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

[`ParticleBody`](ParticleBody.md).[`attached`](ParticleBody.md#attached)

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

[`ParticleBody`](ParticleBody.md).[`data`](ParticleBody.md#data)

***

### energyChunks

#### Get Signature

> **get** **energyChunks**(): `number`

Defined in: [src/elements/physics/bodies/SoftBody.ts:195](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/bodies/SoftBody.ts#L195)

Blocos da energia do corpo (um grupo da GPU por bloco).

##### Returns

`number`

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

[`ParticleBody`](ParticleBody.md).[`rawData`](ParticleBody.md#rawdata)

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

[`ParticleBody`](ParticleBody.md).[`add`](ParticleBody.md#add)

***

### bodyDescriptor()

> `protected` **bodyDescriptor**(): [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)

Defined in: [src/elements/physics/bodies/ParticleBody.ts:65](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/bodies/ParticleBody.ts#L65)

Descritor das partículas: pool do schema, `count` slots, enviado só na inserção.

#### Returns

[`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)

#### Inherited from

[`ParticleBody`](ParticleBody.md).[`bodyDescriptor`](ParticleBody.md#bodydescriptor)

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

[`ParticleBody`](ParticleBody.md).[`detach`](ParticleBody.md#detach)

***

### getDescriptors()

> **getDescriptors**(): readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

Defined in: [src/elements/physics/bodies/SoftBody.ts:230](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/bodies/SoftBody.ts#L230)

Partículas e, com arestas, a faixa de restrições de distância (enviadas só na inserção); num corpo de um dos três
algoritmos, a faixa do corpo (`SoftBodyRange`) e os blocos da energia (`SoftBodyChunk`), enviados na inserção, a
soma de cada bloco (`SoftBodyPartial`) e a série temporal da energia (spec 037: o canal `SoftBodyEnergy`, de 8
fatias, no mesmo slot da faixa) — as duas últimas alocadas só quando um `EnergyMeter` as pede.

#### Returns

readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

#### Overrides

[`ParticleBody`](ParticleBody.md).[`getDescriptors`](ParticleBody.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly [`PipelineDescriptor`](../../platform/web/interfaces/PipelineDescriptor.md)[]

Defined in: [src/elements/physics/bodies/PhysicsBody.ts:23](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/bodies/PhysicsBody.ts#L23)

Pipelines GPU declaradas pelo resource (shader e entry points; recursos
pelos módulos declarados). Útil para Materials que carregam shaders próprios.
Vazio para a maioria (Flows criam pipelines diretamente).

#### Returns

readonly [`PipelineDescriptor`](../../platform/web/interfaces/PipelineDescriptor.md)[]

#### Inherited from

[`ParticleBody`](ParticleBody.md).[`getPipelineDescriptors`](ParticleBody.md#getpipelinedescriptors)

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

[`SoftBodyData`](../interfaces/SoftBodyData.md)

#### Returns

`void`

#### Inherited from

[`ParticleBody`](ParticleBody.md).[`redescribe`](ParticleBody.md#redescribe)
