[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / SoftBody

# Class: SoftBody

Defined in: [elements/physics/bodies/SoftBody.ts:98](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/physics/bodies/SoftBody.ts#L98)

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

Defined in: [elements/physics/bodies/SoftBody.ts:104](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/physics/bodies/SoftBody.ts#L104)

#### Parameters

##### options

[`SoftBodyOptions`](../type-aliases/SoftBodyOptions.md)

#### Returns

`SoftBody`

#### Overrides

[`ParticleBody`](ParticleBody.md).[`constructor`](ParticleBody.md#constructor)

## Properties

### count

> `readonly` **count**: `number`

Defined in: [elements/physics/bodies/ParticleBody.ts:39](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/physics/bodies/ParticleBody.ts#L39)

Número de partículas.

#### Inherited from

[`ParticleBody`](ParticleBody.md).[`count`](ParticleBody.md#count)

***

### edgeCount

> `readonly` **edgeCount**: `number`

Defined in: [elements/physics/bodies/SoftBody.ts:100](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/physics/bodies/SoftBody.ts#L100)

Número de arestas (restrições de distância internas).

***

### particleSchema

> `readonly` **particleSchema**: `StructSchema`

Defined in: [elements/physics/bodies/ParticleBody.ts:41](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/physics/bodies/ParticleBody.ts#L41)

Schema do struct da partícula (o do pool).

#### Inherited from

[`ParticleBody`](ParticleBody.md).[`particleSchema`](ParticleBody.md#particleschema)

***

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/physics/bodies/PhysicsBody.ts:19](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/physics/bodies/PhysicsBody.ts#L19)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Inherited from

[`ParticleBody`](ParticleBody.md).[`state`](ParticleBody.md#state)

***

### surface

> `readonly` **surface**: [`SurfaceGeometry`](SurfaceGeometry.md) \| `undefined` = `undefined`

Defined in: [elements/physics/bodies/SoftBody.ts:102](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/physics/bodies/SoftBody.ts#L102)

Superfície desenhada como malha, se declarada (parte do corpo).

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](Entity.md)\<`object`\>[]

Defined in: [scene/contracts/Entity.ts:138](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/scene/contracts/Entity.ts#L138)

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

Defined in: [scene/contracts/Entity.ts:90](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/scene/contracts/Entity.ts#L90)

Dados do Resource (o layout é o do schema dos descritores). Na cena, mutações de campo (`data.position = …`,
`data.position[0] = …`) e a reatribuição inteira (`data = …`) marcam o recurso para envio.

##### Returns

`TData`

#### Set Signature

> **set** **data**(`next`): `void`

Defined in: [scene/contracts/Entity.ts:96](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/scene/contracts/Entity.ts#L96)

Troca o dado inteiro; na cena, o recurso inteiro é marcado para envio.

##### Parameters

###### next

`TData`

##### Returns

`void`

#### Inherited from

[`ParticleBody`](ParticleBody.md).[`data`](ParticleBody.md#data)

***

### rawData

#### Get Signature

> **get** `protected` **rawData**(): `Readonly`\<`TData`\>

Defined in: [scene/contracts/Entity.ts:110](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/scene/contracts/Entity.ts#L110)

O dado cru, sem o proxy reativo — para leituras do próprio Resource (ex.: uma propriedade derivada consultada pelos
estágios) que não devem criar proxies aninhados. Escrever por aqui não marca o recurso.

##### Returns

`Readonly`\<`TData`\>

#### Inherited from

[`ParticleBody`](ParticleBody.md).[`rawData`](ParticleBody.md#rawdata)

## Methods

### add()

> **add**(`e`): `this`

Defined in: [scene/contracts/Entity.ts:118](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/scene/contracts/Entity.ts#L118)

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

> `protected` **bodyDescriptor**(): `GPUDescriptor`

Defined in: [elements/physics/bodies/ParticleBody.ts:65](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/physics/bodies/ParticleBody.ts#L65)

Descritor das partículas: pool do schema, `count` slots, enviado só na inserção.

#### Returns

`GPUDescriptor`

#### Inherited from

[`ParticleBody`](ParticleBody.md).[`bodyDescriptor`](ParticleBody.md#bodydescriptor)

***

### detach()

> **detach**(`e`): `boolean`

Defined in: [scene/contracts/Entity.ts:127](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/scene/contracts/Entity.ts#L127)

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

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [elements/physics/bodies/SoftBody.ts:167](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/physics/bodies/SoftBody.ts#L167)

Partículas e, com arestas, a faixa de restrições de distância (enviadas só na inserção).

#### Returns

readonly `GPUDescriptor`[]

#### Overrides

[`ParticleBody`](ParticleBody.md).[`getDescriptors`](ParticleBody.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/physics/bodies/PhysicsBody.ts:23](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/elements/physics/bodies/PhysicsBody.ts#L23)

Pipelines GPU declaradas pelo resource (shader source + entry points
+ consumes). Útil para Materials que carregam shaders próprios.
Vazio para a maioria (Flows criam pipelines diretamente).

#### Returns

readonly `PipelineDescriptor`[]

#### Inherited from

[`ParticleBody`](ParticleBody.md).[`getPipelineDescriptors`](ParticleBody.md#getpipelinedescriptors)
