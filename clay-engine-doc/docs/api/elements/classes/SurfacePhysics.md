[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / SurfacePhysics

# Class: SurfacePhysics

Defined in: [src/elements/physics/wetting/SurfacePhysics.ts:73](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/wetting/SurfacePhysics.ts#L73)

SurfacePhysics — a física da superfície de um sólido diante da água (Camada 3, spec 034), componente da entidade do
collider: o que faz a água que o toca espalhar, escorrer, ser absorvida e secar nele. Separada do material (a
aparência pelo grafo): é a física, como o `ParticlePhysics` das partículas.

- Rugosidade (Wenzel): amplia o que o material é — o hidrofílico molha mais — e a histerese: a borda da película
  segura mais água parada antes de romper e escorrer (Furmidge), e o atrito na área real freia o escoamento.
- Porosidade (Lucas–Washburn): a água livre entra nos poros com A² = W t até a capacidade φ × espessura; a superfície
  saturada escurece.
- Temperatura: com a do ar e a umidade do `Atmosphere`, a taxa de evaporação (Carrier); a água absorvida seca mais
  devagar, pela taxa decrescente.

Sem `SurfacePhysics`, o sólido é o padrão (`SurfacePhysics.defaults`: liso e impermeável). Os presets
(`SurfacePhysics.GLASS`, `CONCRETE`…) são opções: `new SurfacePhysics(SurfacePhysics.CONCRETE)`.

```ts
app.world.insert(new BoxGeometry().add(new BoxCollider({ … })).add(new SurfacePhysics(SurfacePhysics.CONCRETE)));
```

## Extends

- [`Entity`](Entity.md)\<[`SurfacePhysicsData`](../interfaces/SurfacePhysicsData.md)\>

## Implements

- [`Resource`](../../platform/web/interfaces/Resource.md)

## Constructors

### Constructor

> **new SurfacePhysics**(`options?`): `SurfacePhysics`

Defined in: [src/elements/physics/wetting/SurfacePhysics.ts:126](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/wetting/SurfacePhysics.ts#L126)

#### Parameters

##### options?

[`SurfacePhysicsOptions`](../interfaces/SurfacePhysicsOptions.md) = `{}`

#### Returns

`SurfacePhysics`

#### Overrides

[`Entity`](Entity.md).[`constructor`](Entity.md#constructor)

## Properties

### state

> **state**: [`ResourceState`](../../platform/web/enumerations/ResourceState.md) = `ResourceState.Uninitialized`

Defined in: [src/elements/physics/wetting/SurfacePhysics.ts:124](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/wetting/SurfacePhysics.ts#L124)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Implementation of

[`Resource`](../../platform/web/interfaces/Resource.md).[`state`](../../platform/web/interfaces/Resource.md#state)

***

### BRICK

> `readonly` `static` **BRICK**: [`SurfacePhysicsOptions`](../interfaces/SurfacePhysicsOptions.md)

Defined in: [src/elements/physics/wetting/SurfacePhysics.ts:112](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/wetting/SurfacePhysics.ts#L112)

Tijolo cerâmico: ângulo da água de ~45°, r ≈ 1,4, histerese de ~35°, porosidade de 30 % em 2 cm e a sortividade
de ~0,3 mm/√s: raio efetivo de 39 nm.

***

### CONCRETE

> `readonly` `static` **CONCRETE**: [`SurfacePhysicsOptions`](../interfaces/SurfacePhysicsOptions.md)

Defined in: [src/elements/physics/wetting/SurfacePhysics.ts:99](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/wetting/SurfacePhysics.ts#L99)

Concreto: ângulo da água de ~50°, rugoso (r ≈ 1,6), histerese de ~40°, porosidade de 15 % numa camada de 2 cm e
a sortividade medida de ~0,1 mm/√s (ASTM C1585): raio efetivo de 19 nm.

***

### defaults

> `readonly` `static` **defaults**: `SurfacePhysics`

Defined in: [src/elements/physics/wetting/SurfacePhysics.ts:122](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/wetting/SurfacePhysics.ts#L122)

O sólido sem `SurfacePhysics`: liso e impermeável, com a histerese padrão.

***

### GLASS

> `readonly` `static` **GLASS**: [`SurfacePhysicsOptions`](../interfaces/SurfacePhysicsOptions.md)

Defined in: [src/elements/physics/wetting/SurfacePhysics.ts:90](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/wetting/SurfacePhysics.ts#L90)

Vidro limpo: liso, histerese de ~5°, impermeável.

***

### GLAZED\_TILE

> `readonly` `static` **GLAZED\_TILE**: [`SurfacePhysicsOptions`](../interfaces/SurfacePhysicsOptions.md)

Defined in: [src/elements/physics/wetting/SurfacePhysics.ts:93](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/wetting/SurfacePhysics.ts#L93)

Cerâmica vidrada (azulejo): quase lisa, histerese de ~15°, impermeável.

***

### MAX

> `readonly` `static` **MAX**: `32` = `32`

Defined in: [src/elements/physics/wetting/SurfacePhysics.ts:87](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/wetting/SurfacePhysics.ts#L87)

Superfícies distintas que a película distingue numa cena (as demais ficam com o padrão).

***

### schema

> `readonly` `static` **schema**: [`StructSchema`](../../platform/web/classes/StructSchema.md)

Defined in: [src/elements/physics/wetting/SurfacePhysics.ts:75](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/wetting/SurfacePhysics.ts#L75)

Schema do dado (a ordem das superfícies na cena vem da consulta por ele).

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

[`Entity`](Entity.md).[`attached`](Entity.md#attached)

***

### contactAngle

#### Get Signature

> **get** **contactAngle**(): `number` \| `undefined`

Defined in: [src/elements/physics/wetting/SurfacePhysics.ts:162](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/wetting/SurfacePhysics.ts#L162)

Ângulo de Young próprio (graus), ou `undefined` (o do líquido).

##### Returns

`number` \| `undefined`

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

### hysteresis

#### Get Signature

> **get** **hysteresis**(): `number`

Defined in: [src/elements/physics/wetting/SurfacePhysics.ts:157](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/wetting/SurfacePhysics.ts#L157)

Histerese do ângulo de contato no sólido liso (graus).

##### Returns

`number`

***

### poreRadius

#### Get Signature

> **get** **poreRadius**(): `number`

Defined in: [src/elements/physics/wetting/SurfacePhysics.ts:172](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/wetting/SurfacePhysics.ts#L172)

Raio efetivo dos capilares (m).

##### Returns

`number`

***

### porosity

#### Get Signature

> **get** **porosity**(): `number`

Defined in: [src/elements/physics/wetting/SurfacePhysics.ts:167](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/wetting/SurfacePhysics.ts#L167)

Fração de vazios.

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

### roughness

#### Get Signature

> **get** **roughness**(): `number`

Defined in: [src/elements/physics/wetting/SurfacePhysics.ts:152](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/wetting/SurfacePhysics.ts#L152)

Razão de Wenzel.

##### Returns

`number`

***

### temperature

#### Get Signature

> **get** **temperature**(): `number` \| `undefined`

Defined in: [src/elements/physics/wetting/SurfacePhysics.ts:182](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/wetting/SurfacePhysics.ts#L182)

Temperatura própria (°C), ou `undefined` (a do ar).

##### Returns

`number` \| `undefined`

***

### thickness

#### Get Signature

> **get** **thickness**(): `number`

Defined in: [src/elements/physics/wetting/SurfacePhysics.ts:177](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/wetting/SurfacePhysics.ts#L177)

Espessura da camada que absorve (m).

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

Defined in: [src/elements/physics/wetting/SurfacePhysics.ts:187](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/wetting/SurfacePhysics.ts#L187)

Sem dado de GPU: o estágio da película leva as grandezas derivadas ao uniform do campo.

#### Returns

readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

#### Implementation of

[`Resource`](../../platform/web/interfaces/Resource.md).[`getDescriptors`](../../platform/web/interfaces/Resource.md#getdescriptors)

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly [`PipelineDescriptor`](../../platform/web/interfaces/PipelineDescriptor.md)[]

Defined in: [src/elements/physics/wetting/SurfacePhysics.ts:191](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/wetting/SurfacePhysics.ts#L191)

Pipelines GPU declaradas pelo resource (shader e entry points; recursos
pelos módulos declarados). Útil para Materials que carregam shaders próprios.
Vazio para a maioria (Flows criam pipelines diretamente).

#### Returns

readonly [`PipelineDescriptor`](../../platform/web/interfaces/PipelineDescriptor.md)[]

#### Implementation of

[`Resource`](../../platform/web/interfaces/Resource.md).[`getPipelineDescriptors`](../../platform/web/interfaces/Resource.md#getpipelinedescriptors)

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

[`SurfacePhysicsData`](../interfaces/SurfacePhysicsData.md)

#### Returns

`void`

#### Inherited from

[`Entity`](Entity.md).[`redescribe`](Entity.md#redescribe)
