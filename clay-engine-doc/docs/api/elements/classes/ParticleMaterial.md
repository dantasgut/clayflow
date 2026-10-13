[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / ParticleMaterial

# Class: ParticleMaterial

Defined in: [elements/physics/materials/ParticleMaterial.ts:69](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/physics/materials/ParticleMaterial.ts#L69)

ParticleMaterial — material dos corpos de partículas (fluidos SPH, PBF e MPM; sólidos MPM), em vocabulário de
domínio. Recurso único por cena, lido pelos estágios de física como o `GravityField`; sem material no World, os
estágios usam os padrões (`ParticleMaterial.of(world)`).

As grandezas numéricas dos solvers derivam dele: massa da partícula ρ₀s³, raio de suavização do SPH (1,3 s; spline
cúbica com suporte 2h) e do PBF (2 s; poly6/spiky com suporte h), célula da grade MPM (2 s), módulo volumétrico
ρ₀c², parâmetros de Lamé de E/ν e o passo estável de cada algoritmo.

## Extends

- [`Entity`](Entity.md)

## Implements

- `Resource`

## Constructors

### Constructor

> **new ParticleMaterial**(`options?`): `ParticleMaterial`

Defined in: [elements/physics/materials/ParticleMaterial.ts:97](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/physics/materials/ParticleMaterial.ts#L97)

#### Parameters

##### options?

[`ParticleMaterialOptions`](../interfaces/ParticleMaterialOptions.md) = `{}`

#### Returns

`ParticleMaterial`

#### Overrides

[`Entity`](Entity.md).[`constructor`](Entity.md#constructor)

## Properties

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [elements/physics/materials/ParticleMaterial.ts:95](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/physics/materials/ParticleMaterial.ts#L95)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Implementation of

`Resource.state`

***

### defaults

> `readonly` `static` **defaults**: `ParticleMaterial`

Defined in: [elements/physics/materials/ParticleMaterial.ts:85](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/physics/materials/ParticleMaterial.ts#L85)

Material padrão (usado quando o World não tem um).

***

### schema

> `readonly` `static` **schema**: `StructSchema`

Defined in: [elements/physics/materials/ParticleMaterial.ts:71](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/physics/materials/ParticleMaterial.ts#L71)

Schema do uniform do material (dado do World; os estágios copiam os derivados para os seus parâmetros).

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](Entity.md)[]

Defined in: [scene/contracts/Entity.ts:125](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/scene/contracts/Entity.ts#L125)

Lista somente-leitura dos filhos diretos. World.insert traverse essa
árvore recursivamente para coletar todos os Resources de um root.

##### Returns

readonly [`Entity`](Entity.md)[]

#### Inherited from

[`Entity`](Entity.md).[`attached`](Entity.md#attached)

***

### bulkModulus

#### Get Signature

> **get** **bulkModulus**(): `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:202](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/physics/materials/ParticleMaterial.ts#L202)

Módulo volumétrico K = ρ₀c² (fluido fracamente compressível).

##### Returns

`number`

***

### data

#### Get Signature

> **get** **data**(): `Record`\<`string`, `unknown`\>

Defined in: [scene/contracts/Entity.ts:88](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/scene/contracts/Entity.ts#L88)

Dados do Resource (o layout é o do schema dos descritores). Na cena, mutações de campo (`data.position = …`,
`data.position[0] = …`) e a reatribuição inteira (`data = …`) marcam o recurso para envio.

##### Returns

`Record`\<`string`, `unknown`\>

#### Set Signature

> **set** **data**(`next`): `void`

Defined in: [scene/contracts/Entity.ts:94](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/scene/contracts/Entity.ts#L94)

Troca o dado inteiro; na cena, o recurso inteiro é marcado para envio.

##### Parameters

###### next

`Record`\<`string`, `unknown`\>

##### Returns

`void`

#### Implementation of

`Resource.data`

#### Inherited from

[`Entity`](Entity.md).[`data`](Entity.md#data)

***

### domainMax

#### Get Signature

> **get** **domainMax**(): \[`number`, `number`, `number`\]

Defined in: [elements/physics/materials/ParticleMaterial.ts:171](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/physics/materials/ParticleMaterial.ts#L171)

Canto máximo do domínio.

##### Returns

\[`number`, `number`, `number`\]

***

### domainMin

#### Get Signature

> **get** **domainMin**(): \[`number`, `number`, `number`\]

Defined in: [elements/physics/materials/ParticleMaterial.ts:165](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/physics/materials/ParticleMaterial.ts#L165)

Canto mínimo do domínio.

##### Returns

\[`number`, `number`, `number`\]

***

### lame

#### Get Signature

> **get** **lame**(): [`LameParameters`](../interfaces/LameParameters.md)

Defined in: [elements/physics/materials/ParticleMaterial.ts:212](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/physics/materials/ParticleMaterial.ts#L212)

Parâmetros de Lamé (μ, λ) dos sólidos MPM, de E e ν.

##### Returns

[`LameParameters`](../interfaces/LameParameters.md)

***

### mpmCellSize

#### Get Signature

> **get** **mpmCellSize**(): `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:197](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/physics/materials/ParticleMaterial.ts#L197)

Célula da grade MPM: 2 s (8 partículas por célula em repouso).

##### Returns

`number`

***

### mpmStableDt

#### Get Signature

> **get** **mpmStableDt**(): `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:224](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/physics/materials/ParticleMaterial.ts#L224)

Passo estável do MPM: 0,3 dx / max(c, √((λ+2μ)/ρ₀)).

##### Returns

`number`

***

### particleMass

#### Get Signature

> **get** **particleMass**(): `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:182](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/physics/materials/ParticleMaterial.ts#L182)

Massa de uma partícula: ρ₀s³.

##### Returns

`number`

***

### particleSpacing

#### Get Signature

> **get** **particleSpacing**(): `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:145](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/physics/materials/ParticleMaterial.ts#L145)

Espaçamento s (m).

##### Returns

`number`

***

### particleVolume

#### Get Signature

> **get** **particleVolume**(): `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:177](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/physics/materials/ParticleMaterial.ts#L177)

Volume de repouso de uma partícula: s³.

##### Returns

`number`

***

### pbfSmoothingLength

#### Get Signature

> **get** **pbfSmoothingLength**(): `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:192](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/physics/materials/ParticleMaterial.ts#L192)

Raio de suavização do PBF (poly6/spiky, suporte h): 2 s.

##### Returns

`number`

***

### rawData

#### Get Signature

> **get** `protected` **rawData**(): `Readonly`\<`Record`\<`string`, `unknown`\>\>

Defined in: [scene/contracts/Entity.ts:108](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/scene/contracts/Entity.ts#L108)

O dado cru, sem o proxy reativo — para leituras do próprio Resource (ex.: uma propriedade derivada consultada pelos
estágios) que não devem criar proxies aninhados. Escrever por aqui não marca o recurso.

##### Returns

`Readonly`\<`Record`\<`string`, `unknown`\>\>

#### Inherited from

[`Entity`](Entity.md).[`rawData`](Entity.md#rawdata)

***

### restDensity

#### Get Signature

> **get** **restDensity**(): `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:140](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/physics/materials/ParticleMaterial.ts#L140)

Densidade de repouso ρ₀ (kg/m³).

##### Returns

`number`

***

### restitution

#### Get Signature

> **get** **restitution**(): `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:160](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/physics/materials/ParticleMaterial.ts#L160)

Restituição.

##### Returns

`number`

***

### speedOfSound

#### Get Signature

> **get** **speedOfSound**(): `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:155](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/physics/materials/ParticleMaterial.ts#L155)

Velocidade do som c (m/s).

##### Returns

`number`

***

### sphSmoothingLength

#### Get Signature

> **get** **sphSmoothingLength**(): `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:187](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/physics/materials/ParticleMaterial.ts#L187)

Raio de suavização do SPH (spline cúbica, suporte 2h): 1,3 s.

##### Returns

`number`

***

### sphStableDt

#### Get Signature

> **get** **sphStableDt**(): `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:219](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/physics/materials/ParticleMaterial.ts#L219)

Passo estável do SPH (CFL): 0,4 h / c.

##### Returns

`number`

***

### taitStiffness

#### Get Signature

> **get** **taitStiffness**(): `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:207](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/physics/materials/ParticleMaterial.ts#L207)

Rigidez da equação de Tait do SPH: k₀ = ρ₀c²/γ.

##### Returns

`number`

***

### viscosity

#### Get Signature

> **get** **viscosity**(): `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:150](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/physics/materials/ParticleMaterial.ts#L150)

Viscosidade.

##### Returns

`number`

## Methods

### add()

> **add**(`e`): `this`

Defined in: [scene/contracts/Entity.ts:116](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/scene/contracts/Entity.ts#L116)

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

Defined in: [elements/physics/materials/ParticleMaterial.ts:247](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/physics/materials/ParticleMaterial.ts#L247)

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

Defined in: [elements/physics/materials/ParticleMaterial.ts:251](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/physics/materials/ParticleMaterial.ts#L251)

Pipelines GPU declaradas pelo resource (shader source + entry points
+ consumes). Útil para Materials que carregam shaders próprios.
Vazio para a maioria (Flows criam pipelines diretamente).

#### Returns

readonly `PipelineDescriptor`[]

#### Implementation of

`Resource.getPipelineDescriptors`

***

### gridFor()

> **gridFor**(`cellSize`): [`ParticleGrid`](../interfaces/ParticleGrid.md)

Defined in: [elements/physics/materials/ParticleMaterial.ts:234](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/physics/materials/ParticleMaterial.ts#L234)

Grade que cobre o domínio com células de `cellSize`: origem no canto mínimo e dimensões arredondadas para cima
(usada pela vizinhança do SPH/PBF e pela grade do MPM).

#### Parameters

##### cellSize

`number`

#### Returns

[`ParticleGrid`](../interfaces/ParticleGrid.md)

***

### of()

> `static` **of**(`world`): `ParticleMaterial`

Defined in: [elements/physics/materials/ParticleMaterial.ts:88](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/physics/materials/ParticleMaterial.ts#L88)

Material do World, ou o padrão.

#### Parameters

##### world

`World`

#### Returns

`ParticleMaterial`

***

### substepsFor()

> `static` **substepsFor**(`stepDt`, `stableDt`, `minimum?`): `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:243](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/physics/materials/ParticleMaterial.ts#L243)

Substeps necessários para avançar `stepDt` sem passar do passo estável `stableDt`.

#### Parameters

##### stepDt

`number`

##### stableDt

`number`

##### minimum?

`number` = `1`

#### Returns

`number`
