[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / ParticlePhysics

# Class: ParticlePhysics

Defined in: [src/elements/physics/ParticlePhysics.ts:194](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L194)

ParticlePhysics — física dos corpos de partículas (fluidos SPH, PBF e MPM; sólidos MPM), em vocabulário de
domínio. Recurso único por cena, lido pelos estágios de física como o `GravityField`; sem `ParticlePhysics` no World, os
estágios usam os padrões (`ParticlePhysics.of(world)`).

As grandezas numéricas dos solvers derivam dele: massa da partícula ρ₀s³, raio de suavização do SPH (1,3 s; spline
cúbica com suporte 2h) e do PBF (2 s; poly6/spiky com suporte h), célula da grade MPM (2 s), módulo volumétrico
ρ₀c², parâmetros de Lamé de E/ν e o passo estável de cada algoritmo (o do PBF escalado da calibração, spec 017).

## Extends

- [`Entity`](Entity.md)\<[`ParticlePhysicsData`](../interfaces/ParticlePhysicsData.md)\>

## Implements

- [`Resource`](../../platform/web/interfaces/Resource.md)

## Constructors

### Constructor

> **new ParticlePhysics**(`options?`): `ParticlePhysics`

Defined in: [src/elements/physics/ParticlePhysics.ts:275](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L275)

#### Parameters

##### options?

[`ParticlePhysicsOptions`](../interfaces/ParticlePhysicsOptions.md) = `{}`

#### Returns

`ParticlePhysics`

#### Overrides

[`Entity`](Entity.md).[`constructor`](Entity.md#constructor)

## Properties

### contactAngle

> `readonly` **contactAngle**: `number`

Defined in: [src/elements/physics/ParticlePhysics.ts:258](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L258)

Ângulo de contato θ com as fronteiras sólidas, em graus (90 sem `surfaceTension`: nem molha nem repele). Além da
adesão, dá a forma da gota pousada num sólido no campo dos fluidos (a calota que molha).

***

### slidingAngle

> `readonly` **slidingAngle**: `number`

Defined in: [src/elements/physics/ParticlePhysics.ts:261](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L261)

Ângulo de deslize das gotas soltas, em graus (0 sem ancoramento).

***

### state

> **state**: [`ResourceState`](../../platform/web/enumerations/ResourceState.md) = `ResourceState.Uninitialized`

Defined in: [src/elements/physics/ParticlePhysics.ts:273](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L273)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Implementation of

[`Resource`](../../platform/web/interfaces/Resource.md).[`state`](../../platform/web/interfaces/Resource.md#state)

***

### surfaceTension

> `readonly` **surfaceTension**: `number`

Defined in: [src/elements/physics/ParticlePhysics.ts:264](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L264)

Tensão superficial física γ (N/m); 0 no modo adimensional (`cohesion`/`adhesion`).

***

### defaults

> `readonly` `static` **defaults**: `ParticlePhysics`

Defined in: [src/elements/physics/ParticlePhysics.ts:224](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L224)

Comportamento padrão (usado quando o World não tem um).

***

### schema

> `readonly` `static` **schema**: [`StructSchema`](../../platform/web/classes/StructSchema.md)

Defined in: [src/elements/physics/ParticlePhysics.ts:196](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L196)

Schema do uniform da física (dado do World; os estágios copiam os derivados para os seus parâmetros).

***

### WATER

> `readonly` `static` **WATER**: `object`

Defined in: [src/elements/physics/ParticlePhysics.ts:234](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L234)

Água física (spec 010): densidade 1000 kg/m³, viscosidade dinâmica 0,001 Pa·s, tensão superficial 0,072 N/m,
ângulo de contato de 30° (molha), restituição zero no choque com sólidos (a gota que molha espalha, não volta) e
ângulo de deslize de 25° das gotas soltas (spec 034). Coesão e adesão saem na escala do espaçamento — a 2,5 cm, ~0,01 g e ~0,02 g;
a milímetros, dominam. A suavização XSPH é a da água pouco viscosa (0,01): com 0,05, o padrão, o balanço da
barragem no tanque perdia ~70 % mais velocidade em 7,5 s e a água parava cedo (medido, 2026-10-29). Uso:
`new ParticlePhysics({ ...ParticlePhysics.WATER, particleSpacing })`.

#### contactAngle

> `readonly` **contactAngle**: `30` = `30`

#### restDensity

> `readonly` **restDensity**: `1000` = `1000`

#### restitution

> `readonly` **restitution**: `0` = `0`

#### slidingAngle

> `readonly` **slidingAngle**: `25` = `25`

#### surfaceTension

> `readonly` **surfaceTension**: `0.072` = `0.072`

#### viscosity

> `readonly` **viscosity**: `0.001` = `0.001`

#### xsph

> `readonly` **xsph**: `0.01` = `0.01`

***

### WATER\_ADHESION

> `readonly` `static` **WATER\_ADHESION**: `8` = `8`

Defined in: [src/elements/physics/ParticlePhysics.ts:221](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L221)

Adesão de referência da água (calibrada pelo smoke `fluidBehavior`: menisco junto à parede).

***

### WATER\_COHESION

> `readonly` `static` **WATER\_COHESION**: `3` = `3`

Defined in: [src/elements/physics/ParticlePhysics.ts:218](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L218)

Coesão de referência da água nas cenas de 2–5 cm de espaçamento (calibrada pelo smoke `fluidBehavior`: gota
isolada arredondada em 3 s, filete que se parte em gotas). Não é a tensão física de 0,072 N/m — nessa escala, ela
seria invisível.

***

### WET\_NEIGHBORS

> `readonly` `static` **WET\_NEIGHBORS**: `8` = `8`

Defined in: [src/elements/physics/ParticlePhysics.ts:249](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L249)

Vizinhas abaixo das quais a partícula é uma gota solta (spec 034): encostada num sólido que a água molha, ela
representa gotas menores que a resolução, em que a borda ancorada domina (`slidingAngle`) — a mesma contagem que
faz o campo dos fluidos desenhá-la como gota isolada. Com outra água por perto, volta ao volume.

## Accessors

### adhesion

#### Get Signature

> **get** **adhesion**(): `number`

Defined in: [src/elements/physics/ParticlePhysics.ts:377](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L377)

Adesão às fronteiras sólidas, adimensional.

##### Returns

`number`

***

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

### bulkModulus

#### Get Signature

> **get** **bulkModulus**(): `number`

Defined in: [src/elements/physics/ParticlePhysics.ts:439](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L439)

Módulo volumétrico K = ρ₀c² (fluido fracamente compressível).

##### Returns

`number`

***

### cohesion

#### Get Signature

> **get** **cohesion**(): `number`

Defined in: [src/elements/physics/ParticlePhysics.ts:372](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L372)

Coesão (tensão superficial), adimensional.

##### Returns

`number`

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

### domainMax

#### Get Signature

> **get** **domainMax**(): \[`number`, `number`, `number`\]

Defined in: [src/elements/physics/ParticlePhysics.ts:408](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L408)

Canto máximo do domínio.

##### Returns

\[`number`, `number`, `number`\]

***

### domainMin

#### Get Signature

> **get** **domainMin**(): \[`number`, `number`, `number`\]

Defined in: [src/elements/physics/ParticlePhysics.ts:402](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L402)

##### Returns

\[`number`, `number`, `number`\]

***

### lame

#### Get Signature

> **get** **lame**(): [`LameParameters`](../interfaces/LameParameters.md)

Defined in: [src/elements/physics/ParticlePhysics.ts:449](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L449)

Parâmetros de Lamé (μ, λ) dos sólidos MPM, de E e ν.

##### Returns

[`LameParameters`](../interfaces/LameParameters.md)

***

### mpmCellSize

#### Get Signature

> **get** **mpmCellSize**(): `number`

Defined in: [src/elements/physics/ParticlePhysics.ts:434](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L434)

Célula da grade MPM: 2 s (8 partículas por célula em repouso).

##### Returns

`number`

***

### mpmStableDt

#### Get Signature

> **get** **mpmStableDt**(): `number`

Defined in: [src/elements/physics/ParticlePhysics.ts:474](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L474)

Passo estável do MPM: 0,3 dx / max(c, √((λ+2μ)/ρ₀)) e, com viscosidade, a restrição difusiva dx²ρ₀/(6 μ) da
tensão viscosa do fluido.

##### Returns

`number`

***

### openBounds

#### Get Signature

> **get** **openBounds**(): `boolean`

Defined in: [src/elements/physics/ParticlePhysics.ts:398](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L398)

Domínio aberto (`bounds: 'open'`, spec 010): sem paredes; o que sai da caixa é retirado.

##### Returns

`boolean`

***

### particleMass

#### Get Signature

> **get** **particleMass**(): `number`

Defined in: [src/elements/physics/ParticlePhysics.ts:419](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L419)

Massa de uma partícula: ρ₀s³.

##### Returns

`number`

***

### particleSpacing

#### Get Signature

> **get** **particleSpacing**(): `number`

Defined in: [src/elements/physics/ParticlePhysics.ts:362](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L362)

Espaçamento s (m).

##### Returns

`number`

***

### particleVolume

#### Get Signature

> **get** **particleVolume**(): `number`

Defined in: [src/elements/physics/ParticlePhysics.ts:414](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L414)

Volume de repouso de uma partícula: s³.

##### Returns

`number`

***

### pbfSmoothingLength

#### Get Signature

> **get** **pbfSmoothingLength**(): `number`

Defined in: [src/elements/physics/ParticlePhysics.ts:429](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L429)

Raio de suavização do PBF (poly6/spiky, suporte h): 2 s.

##### Returns

`number`

***

### pbfStableDt

#### Get Signature

> **get** **pbfStableDt**(): `number`

Defined in: [src/elements/physics/ParticlePhysics.ts:466](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L466)

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

Defined in: [src/scene/contracts/Entity.ts:117](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L117)

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

Defined in: [src/elements/physics/ParticlePhysics.ts:357](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L357)

Densidade de repouso ρ₀ (kg/m³).

##### Returns

`number`

***

### restitution

#### Get Signature

> **get** **restitution**(): `number`

Defined in: [src/elements/physics/ParticlePhysics.ts:392](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L392)

Restituição.

##### Returns

`number`

***

### speedOfSound

#### Get Signature

> **get** **speedOfSound**(): `number`

Defined in: [src/elements/physics/ParticlePhysics.ts:387](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L387)

Velocidade do som c (m/s).

##### Returns

`number`

***

### sphSmoothingLength

#### Get Signature

> **get** **sphSmoothingLength**(): `number`

Defined in: [src/elements/physics/ParticlePhysics.ts:424](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L424)

Raio de suavização do SPH (spline cúbica, suporte 2h): 1,3 s.

##### Returns

`number`

***

### sphStableDt

#### Get Signature

> **get** **sphStableDt**(): `number`

Defined in: [src/elements/physics/ParticlePhysics.ts:456](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L456)

Passo estável do SPH (CFL): 0,4 h / c.

##### Returns

`number`

***

### taitStiffness

#### Get Signature

> **get** **taitStiffness**(): `number`

Defined in: [src/elements/physics/ParticlePhysics.ts:444](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L444)

Rigidez da equação de Tait do SPH: k₀ = ρ₀c²/γ.

##### Returns

`number`

***

### viscosity

#### Get Signature

> **get** **viscosity**(): `number`

Defined in: [src/elements/physics/ParticlePhysics.ts:367](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L367)

Viscosidade.

##### Returns

`number`

***

### xsph

#### Get Signature

> **get** **xsph**(): `number`

Defined in: [src/elements/physics/ParticlePhysics.ts:382](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L382)

Suavização de velocidade XSPH.

##### Returns

`number`

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

### adhesionAccel()

> **adhesionAccel**(`adhesion?`): `number`

Defined in: [src/elements/physics/ParticlePhysics.ts:495](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L495)

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

Defined in: [src/elements/physics/ParticlePhysics.ts:503](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L503)

Arrasto tangencial da adesão (1/s) no contato: `adesão · √(g/s)` no modo adimensional; com `surfaceTension`, o
viscoso da parede μ/(ρ₀ s²) (spec 010).

#### Parameters

##### adhesion?

`number` = `...`

#### Returns

`number`

***

### cohesionGamma()

> **cohesionGamma**(`cohesion?`): `number`

Defined in: [src/elements/physics/ParticlePhysics.ts:487](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L487)

γ de Akinci et al. 2013 em unidades do solver, para o suporte `support` (H) da vizinhança e a coesão dada (padrão
a da física): a partícula na borda de um meio-espaço de fluido sente `coesão · g`.

#### Parameters

##### cohesion?

`number` = `...`

#### Returns

`number`

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

Defined in: [src/elements/physics/ParticlePhysics.ts:569](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L569)

Lista de bindings GPU (uniform/storage buffers, texturas, samplers)
que este resource expõe ao `ResourceSystem`. Cada descriptor define
`id`, `role`, `schema` (StructSchema) e opcionalmente `storage`
(`'pool'` para coalescer N members do mesmo schema em 1 buffer).

#### Returns

readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

#### Implementation of

[`Resource`](../../platform/web/interfaces/Resource.md).[`getDescriptors`](../../platform/web/interfaces/Resource.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly [`PipelineDescriptor`](../../platform/web/interfaces/PipelineDescriptor.md)[]

Defined in: [src/elements/physics/ParticlePhysics.ts:573](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L573)

Pipelines GPU declaradas pelo resource (shader e entry points; recursos
pelos módulos declarados). Útil para Materials que carregam shaders próprios.
Vazio para a maioria (Flows criam pipelines diretamente).

#### Returns

readonly [`PipelineDescriptor`](../../platform/web/interfaces/PipelineDescriptor.md)[]

#### Implementation of

[`Resource`](../../platform/web/interfaces/Resource.md).[`getPipelineDescriptors`](../../platform/web/interfaces/Resource.md#getpipelinedescriptors)

***

### gridFor()

> **gridFor**(`cellSize`): [`ParticleGrid`](../interfaces/ParticleGrid.md)

Defined in: [src/elements/physics/ParticlePhysics.ts:556](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L556)

Grade que cobre o domínio com células de `cellSize`: origem no canto mínimo e dimensões arredondadas para cima
(usada pela vizinhança do SPH/PBF e pela grade do MPM).

#### Parameters

##### cellSize

`number`

#### Returns

[`ParticleGrid`](../interfaces/ParticleGrid.md)

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

[`ParticlePhysicsData`](../interfaces/ParticlePhysicsData.md)

#### Returns

`void`

#### Inherited from

[`Entity`](Entity.md).[`redescribe`](Entity.md#redescribe)

***

### surfaceStep()

> **surfaceStep**(`stepDt`, `solverStableDt`, `minimum?`): `SurfaceStep`

Defined in: [src/elements/physics/ParticlePhysics.ts:514](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L514)

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

> `static` **of**(`world`): `ParticlePhysics`

Defined in: [src/elements/physics/ParticlePhysics.ts:267](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L267)

Comportamento do World, ou o padrão.

#### Parameters

##### world

[`World`](../../platform/web/classes/World.md)

#### Returns

`ParticlePhysics`

***

### substepsFor()

> `static` **substepsFor**(`stepDt`, `stableDt`, `minimum?`): `number`

Defined in: [src/elements/physics/ParticlePhysics.ts:565](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/ParticlePhysics.ts#L565)

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
