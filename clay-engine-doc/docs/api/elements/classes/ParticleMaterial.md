[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / ParticleMaterial

# Class: ParticleMaterial

Defined in: [elements/physics/materials/ParticleMaterial.ts:171](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/materials/ParticleMaterial.ts#L171)

ParticleMaterial — material dos corpos de partículas (fluidos SPH, PBF e MPM; sólidos MPM), em vocabulário de
domínio. Recurso único por cena, lido pelos estágios de física como o `GravityField`; sem material no World, os
estágios usam os padrões (`ParticleMaterial.of(world)`).

As grandezas numéricas dos solvers derivam dele: massa da partícula ρ₀s³, raio de suavização do SPH (1,3 s; spline
cúbica com suporte 2h) e do PBF (2 s; poly6/spiky com suporte h), célula da grade MPM (2 s), módulo volumétrico
ρ₀c², parâmetros de Lamé de E/ν e o passo estável de cada algoritmo (o do PBF escalado da calibração, spec 017).

## Extends

- [`Entity`](Entity.md)\<[`ParticleMaterialData`](../interfaces/ParticleMaterialData.md)\>

## Implements

- `Resource`

## Constructors

### Constructor

> **new ParticleMaterial**(`options?`): `ParticleMaterial`

Defined in: [elements/physics/materials/ParticleMaterial.ts:213](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/materials/ParticleMaterial.ts#L213)

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

Defined in: [elements/physics/materials/ParticleMaterial.ts:211](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/materials/ParticleMaterial.ts#L211)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Implementation of

`Resource.state`

***

### defaults

> `readonly` `static` **defaults**: `ParticleMaterial`

Defined in: [elements/physics/materials/ParticleMaterial.ts:201](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/materials/ParticleMaterial.ts#L201)

Material padrão (usado quando o World não tem um).

***

### schema

> `readonly` `static` **schema**: `StructSchema`

Defined in: [elements/physics/materials/ParticleMaterial.ts:173](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/materials/ParticleMaterial.ts#L173)

Schema do uniform do material (dado do World; os estágios copiam os derivados para os seus parâmetros).

***

### WATER\_ADHESION

> `readonly` `static` **WATER\_ADHESION**: `8` = `8`

Defined in: [elements/physics/materials/ParticleMaterial.ts:198](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/materials/ParticleMaterial.ts#L198)

Adesão de referência da água (calibrada pelo smoke `fluidBehavior`: menisco junto à parede).

***

### WATER\_COHESION

> `readonly` `static` **WATER\_COHESION**: `3` = `3`

Defined in: [elements/physics/materials/ParticleMaterial.ts:195](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/materials/ParticleMaterial.ts#L195)

Coesão de referência da água nas cenas de 2–5 cm de espaçamento (calibrada pelo smoke `fluidBehavior`: gota
isolada arredondada em 3 s, filete que se parte em gotas). Não é a tensão física de 0,072 N/m — nessa escala, ela
seria invisível.

## Accessors

### adhesion

#### Get Signature

> **get** **adhesion**(): `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:277](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/materials/ParticleMaterial.ts#L277)

Adesão às fronteiras sólidas, adimensional.

##### Returns

`number`

***

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](Entity.md)\<`object`\>[]

Defined in: [scene/contracts/Entity.ts:138](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/contracts/Entity.ts#L138)

Lista somente-leitura dos filhos diretos. World.insert traverse essa
árvore recursivamente para coletar todos os Resources de um root.

##### Returns

readonly [`Entity`](Entity.md)\<`object`\>[]

#### Inherited from

[`Entity`](Entity.md).[`attached`](Entity.md#attached)

***

### bulkModulus

#### Get Signature

> **get** **bulkModulus**(): `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:334](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/materials/ParticleMaterial.ts#L334)

Módulo volumétrico K = ρ₀c² (fluido fracamente compressível).

##### Returns

`number`

***

### cohesion

#### Get Signature

> **get** **cohesion**(): `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:272](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/materials/ParticleMaterial.ts#L272)

Coesão (tensão superficial), adimensional.

##### Returns

`number`

***

### data

#### Get Signature

> **get** **data**(): `TData`

Defined in: [scene/contracts/Entity.ts:90](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/contracts/Entity.ts#L90)

Dados do Resource (o layout é o do schema dos descritores). Na cena, mutações de campo (`data.position = …`,
`data.position[0] = …`) e a reatribuição inteira (`data = …`) marcam o recurso para envio.

##### Returns

`TData`

#### Set Signature

> **set** **data**(`next`): `void`

Defined in: [scene/contracts/Entity.ts:96](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/contracts/Entity.ts#L96)

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

### domainMax

#### Get Signature

> **get** **domainMax**(): \[`number`, `number`, `number`\]

Defined in: [elements/physics/materials/ParticleMaterial.ts:303](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/materials/ParticleMaterial.ts#L303)

Canto máximo do domínio.

##### Returns

\[`number`, `number`, `number`\]

***

### domainMin

#### Get Signature

> **get** **domainMin**(): \[`number`, `number`, `number`\]

Defined in: [elements/physics/materials/ParticleMaterial.ts:297](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/materials/ParticleMaterial.ts#L297)

Canto mínimo do domínio.

##### Returns

\[`number`, `number`, `number`\]

***

### lame

#### Get Signature

> **get** **lame**(): [`LameParameters`](../interfaces/LameParameters.md)

Defined in: [elements/physics/materials/ParticleMaterial.ts:344](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/materials/ParticleMaterial.ts#L344)

Parâmetros de Lamé (μ, λ) dos sólidos MPM, de E e ν.

##### Returns

[`LameParameters`](../interfaces/LameParameters.md)

***

### mpmCellSize

#### Get Signature

> **get** **mpmCellSize**(): `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:329](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/materials/ParticleMaterial.ts#L329)

Célula da grade MPM: 2 s (8 partículas por célula em repouso).

##### Returns

`number`

***

### mpmStableDt

#### Get Signature

> **get** **mpmStableDt**(): `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:369](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/materials/ParticleMaterial.ts#L369)

Passo estável do MPM: 0,3 dx / max(c, √((λ+2μ)/ρ₀)) e, com viscosidade, a restrição difusiva dx²ρ₀/(6 μ) da
tensão viscosa do fluido.

##### Returns

`number`

***

### particleMass

#### Get Signature

> **get** **particleMass**(): `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:314](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/materials/ParticleMaterial.ts#L314)

Massa de uma partícula: ρ₀s³.

##### Returns

`number`

***

### particleSpacing

#### Get Signature

> **get** **particleSpacing**(): `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:262](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/materials/ParticleMaterial.ts#L262)

Espaçamento s (m).

##### Returns

`number`

***

### particleVolume

#### Get Signature

> **get** **particleVolume**(): `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:309](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/materials/ParticleMaterial.ts#L309)

Volume de repouso de uma partícula: s³.

##### Returns

`number`

***

### pbfSmoothingLength

#### Get Signature

> **get** **pbfSmoothingLength**(): `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:324](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/materials/ParticleMaterial.ts#L324)

Raio de suavização do PBF (poly6/spiky, suporte h): 2 s.

##### Returns

`number`

***

### pbfStableDt

#### Get Signature

> **get** **pbfStableDt**(): `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:361](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/materials/ParticleMaterial.ts#L361)

Passo estável do PBF: o passo da calibração (1/60 s com h = 0,1 m, isto é, 5 cm de espaçamento, e 4 iterações)
escalado por (h / 0,1)². Duas coisas encolhem com o raio do kernel: o deslocamento por substep tolerado (CFL, ∝ h)
e o alcance do solver de Jacobi, que propaga a correção cerca de um kernel por iteração (∝ h) — com o passo
fixo, abaixo de 5 cm o fluido explodia (spec 017).

##### Returns

`number`

***

### rawData

#### Get Signature

> **get** `protected` **rawData**(): `Readonly`\<`TData`\>

Defined in: [scene/contracts/Entity.ts:110](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/contracts/Entity.ts#L110)

O dado cru, sem o proxy reativo — para leituras do próprio Resource (ex.: uma propriedade derivada consultada pelos
estágios) que não devem criar proxies aninhados. Escrever por aqui não marca o recurso.

##### Returns

`Readonly`\<`TData`\>

#### Inherited from

[`Entity`](Entity.md).[`rawData`](Entity.md#rawdata)

***

### restDensity

#### Get Signature

> **get** **restDensity**(): `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:257](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/materials/ParticleMaterial.ts#L257)

Densidade de repouso ρ₀ (kg/m³).

##### Returns

`number`

***

### restitution

#### Get Signature

> **get** **restitution**(): `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:292](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/materials/ParticleMaterial.ts#L292)

Restituição.

##### Returns

`number`

***

### speedOfSound

#### Get Signature

> **get** **speedOfSound**(): `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:287](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/materials/ParticleMaterial.ts#L287)

Velocidade do som c (m/s).

##### Returns

`number`

***

### sphSmoothingLength

#### Get Signature

> **get** **sphSmoothingLength**(): `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:319](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/materials/ParticleMaterial.ts#L319)

Raio de suavização do SPH (spline cúbica, suporte 2h): 1,3 s.

##### Returns

`number`

***

### sphStableDt

#### Get Signature

> **get** **sphStableDt**(): `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:351](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/materials/ParticleMaterial.ts#L351)

Passo estável do SPH (CFL): 0,4 h / c.

##### Returns

`number`

***

### taitStiffness

#### Get Signature

> **get** **taitStiffness**(): `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:339](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/materials/ParticleMaterial.ts#L339)

Rigidez da equação de Tait do SPH: k₀ = ρ₀c²/γ.

##### Returns

`number`

***

### viscosity

#### Get Signature

> **get** **viscosity**(): `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:267](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/materials/ParticleMaterial.ts#L267)

Viscosidade.

##### Returns

`number`

***

### xsph

#### Get Signature

> **get** **xsph**(): `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:282](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/materials/ParticleMaterial.ts#L282)

Suavização de velocidade XSPH.

##### Returns

`number`

## Methods

### add()

> **add**(`e`): `this`

Defined in: [scene/contracts/Entity.ts:118](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/contracts/Entity.ts#L118)

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

### adhesionAccel()

> **adhesionAccel**(`adhesion?`): `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:390](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/materials/ParticleMaterial.ts#L390)

Escala da adesão para o kernel (m/s²): a aceleração normal a distância d é este valor vezes a integral de
meio-espaço do núcleo de Akinci em [max(d/H, ½), 1] — `adesão · g` com a partícula encostada (d = 0).

#### Parameters

##### adhesion?

`number` = `...`

#### Returns

`number`

***

### adhesionTangential()

> **adhesionTangential**(`adhesion?`): `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:395](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/materials/ParticleMaterial.ts#L395)

Arrasto tangencial da adesão (1/s) no contato: `adesão · √(g/s)`.

#### Parameters

##### adhesion?

`number` = `...`

#### Returns

`number`

***

### cohesionGamma()

> **cohesionGamma**(`cohesion?`): `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:382](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/materials/ParticleMaterial.ts#L382)

γ de Akinci et al. 2013 em unidades do solver, para o suporte `support` (H) da vizinhança e a coesão dada (padrão
a do material): a partícula na borda de um meio-espaço de fluido sente `coesão · g`.

#### Parameters

##### cohesion?

`number` = `...`

#### Returns

`number`

***

### detach()

> **detach**(`e`): `boolean`

Defined in: [scene/contracts/Entity.ts:127](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/contracts/Entity.ts#L127)

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

Defined in: [elements/physics/materials/ParticleMaterial.ts:460](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/materials/ParticleMaterial.ts#L460)

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

Defined in: [elements/physics/materials/ParticleMaterial.ts:464](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/materials/ParticleMaterial.ts#L464)

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

Defined in: [elements/physics/materials/ParticleMaterial.ts:447](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/materials/ParticleMaterial.ts#L447)

Grade que cobre o domínio com células de `cellSize`: origem no canto mínimo e dimensões arredondadas para cima
(usada pela vizinhança do SPH/PBF e pela grade do MPM).

#### Parameters

##### cellSize

`number`

#### Returns

[`ParticleGrid`](../interfaces/ParticleGrid.md)

***

### surfaceStep()

> **surfaceStep**(`stepDt`, `solverStableDt`, `minimum?`): `SurfaceStep`

Defined in: [elements/physics/materials/ParticleMaterial.ts:405](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/materials/ParticleMaterial.ts#L405)

Substeps do quadro com coesão e adesão: o passo da oscilação que elas impõem numa partícula (aceleração `valor · g`
ao longo de um espaçamento, 0,4 √(s / (valor · g))) entra junto com o passo estável do solver. Até 4× os substeps
sem elas; acima, coesão e adesão são grampeadas ao que cabe no teto (`clamped`). Com coesão e adesão zero, devolve
exatamente `substepsFor(stepDt, solverStableDt, minimum)`.

#### Parameters

##### stepDt

`number`

##### solverStableDt

`number`

##### minimum?

`number` = `1`

#### Returns

`SurfaceStep`

***

### of()

> `static` **of**(`world`): `ParticleMaterial`

Defined in: [elements/physics/materials/ParticleMaterial.ts:204](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/materials/ParticleMaterial.ts#L204)

Material do World, ou o padrão.

#### Parameters

##### world

`World`

#### Returns

`ParticleMaterial`

***

### substepsFor()

> `static` **substepsFor**(`stepDt`, `stableDt`, `minimum?`): `number`

Defined in: [elements/physics/materials/ParticleMaterial.ts:456](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/physics/materials/ParticleMaterial.ts#L456)

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
