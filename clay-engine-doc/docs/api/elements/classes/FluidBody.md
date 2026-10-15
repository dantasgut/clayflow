[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / FluidBody

# Class: FluidBody

Defined in: [elements/physics/bodies/FluidBody.ts:60](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/bodies/FluidBody.ts#L60)

FluidBody — um fluido (água, fumaça, gel) de N partículas num único Resource (spec 008), na faixa de N slots do pool
do algoritmo (`SPHSchema`, `PBFSchema`, `MPMFluidSchema`), que roteia para o `SPHFlow`, `PBFFlow` ou `MPMFlow`.

 - **Domínio**: `new FluidBody({ algorithm: 'SPH', position, velocity })`, com `position` = `x, y, z` por partícula.
 - **Cru** (avançado): `new FluidBody({ schema, count, data })`, com `data` por campo do schema.

## Extends

- [`ParticleBody`](ParticleBody.md)

## Constructors

### Constructor

> **new FluidBody**(`options`): `FluidBody`

Defined in: [elements/physics/bodies/FluidBody.ts:61](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/bodies/FluidBody.ts#L61)

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

Defined in: [elements/physics/bodies/ParticleBody.ts:39](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/bodies/ParticleBody.ts#L39)

Número de partículas.

#### Inherited from

[`ParticleBody`](ParticleBody.md).[`count`](ParticleBody.md#count)

***

### particleSchema

> `readonly` **particleSchema**: `StructSchema`

Defined in: [elements/physics/bodies/ParticleBody.ts:41](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/bodies/ParticleBody.ts#L41)

Schema do struct da partícula (o do pool).

#### Inherited from

[`ParticleBody`](ParticleBody.md).[`particleSchema`](ParticleBody.md#particleschema)

***

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/physics/bodies/PhysicsBody.ts:19](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/bodies/PhysicsBody.ts#L19)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Inherited from

[`ParticleBody`](ParticleBody.md).[`state`](ParticleBody.md#state)

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

[`ParticleBody`](ParticleBody.md).[`attached`](ParticleBody.md#attached)

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

[`ParticleBody`](ParticleBody.md).[`data`](ParticleBody.md#data)

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

[`ParticleBody`](ParticleBody.md).[`rawData`](ParticleBody.md#rawdata)

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

[`ParticleBody`](ParticleBody.md).[`add`](ParticleBody.md#add)

***

### bodyDescriptor()

> `protected` **bodyDescriptor**(): `GPUDescriptor`

Defined in: [elements/physics/bodies/ParticleBody.ts:65](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/bodies/ParticleBody.ts#L65)

Descritor das partículas: pool do schema, `count` slots, enviado só na inserção.

#### Returns

`GPUDescriptor`

#### Inherited from

[`ParticleBody`](ParticleBody.md).[`bodyDescriptor`](ParticleBody.md#bodydescriptor)

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

[`ParticleBody`](ParticleBody.md).[`detach`](ParticleBody.md#detach)

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [elements/physics/bodies/ParticleBody.ts:60](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/bodies/ParticleBody.ts#L60)

Partículas numa faixa do pool do schema (a simulação é dona do estado depois da inserção).

#### Returns

readonly `GPUDescriptor`[]

#### Inherited from

[`ParticleBody`](ParticleBody.md).[`getDescriptors`](ParticleBody.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/physics/bodies/PhysicsBody.ts:23](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/bodies/PhysicsBody.ts#L23)

Pipelines GPU declaradas pelo resource (shader source + entry points
+ consumes). Útil para Materials que carregam shaders próprios.
Vazio para a maioria (Flows criam pipelines diretamente).

#### Returns

readonly `PipelineDescriptor`[]

#### Inherited from

[`ParticleBody`](ParticleBody.md).[`getPipelineDescriptors`](ParticleBody.md#getpipelinedescriptors)
