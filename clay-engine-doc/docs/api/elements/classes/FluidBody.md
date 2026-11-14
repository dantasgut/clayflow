[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / FluidBody

# Class: FluidBody

Defined in: [src/elements/physics/bodies/FluidBody.ts:62](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/bodies/FluidBody.ts#L62)

FluidBody — um fluido (água, fumaça, gel) de N partículas num único Resource (spec 008), na faixa de N slots do pool
do algoritmo (`SPHSchema`, `PBFSchema`, `MPMFluidSchema`), que roteia para o `SPHFlow`, `PBFFlow` ou `MPMFlow`.

 - **Domínio**: `new FluidBody({ algorithm: 'SPH', position, velocity })`, com `position` = `x, y, z` por partícula.
 - **Cru** (avançado): `new FluidBody({ schema, count, data })`, com `data` por campo do schema.

## Extends

- [`ParticleBody`](ParticleBody.md)

## Constructors

### Constructor

> **new FluidBody**(`options`): `FluidBody`

Defined in: [src/elements/physics/bodies/FluidBody.ts:63](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/bodies/FluidBody.ts#L63)

#### Parameters

##### options

[`FluidBodyOptions`](../type-aliases/FluidBodyOptions.md)

#### Returns

`FluidBody`

#### Overrides

[`ParticleBody`](ParticleBody.md).[`constructor`](ParticleBody.md#constructor)

## Properties

### count

> `readonly` **count**: `number`

Defined in: [src/elements/physics/bodies/ParticleBody.ts:39](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/bodies/ParticleBody.ts#L39)

Número de partículas.

#### Inherited from

[`ParticleBody`](ParticleBody.md).[`count`](ParticleBody.md#count)

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

Defined in: [src/elements/physics/bodies/FluidBody.ts:91](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/bodies/FluidBody.ts#L91)

As partículas e o trabalho por partícula do solver no mesmo slot (spec 039: o pool do próprio corpo).

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

[`ParticleBodyData`](../interfaces/ParticleBodyData.md)

#### Returns

`void`

#### Inherited from

[`ParticleBody`](ParticleBody.md).[`redescribe`](ParticleBody.md#redescribe)
