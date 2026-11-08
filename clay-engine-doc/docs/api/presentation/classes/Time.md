[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [presentation](../README.md) / Time

# Class: Time

Defined in: [src/scene/time/Time.ts:52](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/time/Time.ts#L52)

Relógio da cena (C2): um por World, criado por `createScene` e inserido no World. É a única fonte de tempo dos
estágios — os Flows de física leem `steps`/`stepDt` daqui (consulta pelo schema `Time`), nunca da aplicação.

`advance(realDt)` é o único ponto que move o relógio:
- `realDt` é limitado a `maxFrameDt`; `dt = realDt × scale`; `elapsed += dt`; `frame += 1`.
- Física com passo fixo (`fixedDt`): `accumulator += dt × physicsScale`; o quadro executa
  `steps = min(⌊accumulator / fixedDt⌋, maxStepsPerFrame)` passos de `fixedDt`; o excedente acima de um passo
  que o teto cortou é descartado (`droppedTime`, evento `timeDropped`) — sem espiral de passos.
- Passo variável (`fixedDt = undefined`): 1 passo de `dt × physicsScale` (0 passos se nulo).

Mudanças de `scale`/`physicsScale`/`fixedDt` valem a partir do próximo `advance`. O uniform de GPU `Time`
(`dt, elapsed, stepDt, steps`) acompanha cada avanço.

## Extends

- [`Entity`](../../elements/classes/Entity.md)\<`TimeData`\>

## Implements

- [`Resource`](../../platform/web/interfaces/Resource.md)

## Constructors

### Constructor

> **new Time**(`events?`): `Time`

Defined in: [src/scene/time/Time.ts:91](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/time/Time.ts#L91)

#### Parameters

##### events?

[`EventBus`](../../platform/web/interfaces/EventBus.md)

Barramento onde `timeDropped` é emitido (o da cena). Opcional em testes.

#### Returns

`Time`

#### Overrides

[`Entity`](../../elements/classes/Entity.md).[`constructor`](../../elements/classes/Entity.md#constructor)

## Properties

### state

> **state**: [`ResourceState`](../../platform/web/enumerations/ResourceState.md) = `ResourceState.Uninitialized`

Defined in: [src/scene/time/Time.ts:61](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/time/Time.ts#L61)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Implementation of

[`Resource`](../../platform/web/interfaces/Resource.md).[`state`](../../platform/web/interfaces/Resource.md#state)

***

### schema

> `readonly` `static` **schema**: [`StructSchema`](../../platform/web/classes/StructSchema.md)

Defined in: [src/scene/time/Time.ts:54](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/time/Time.ts#L54)

Schema do uniform de GPU: `dt`, `elapsed`, `stepDt` (f32) e `steps` (u32).

## Accessors

### accumulator

#### Get Signature

> **get** **accumulator**(): `number`

Defined in: [src/scene/time/Time.ts:143](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/time/Time.ts#L143)

Resto de tempo de física para o próximo quadro (s); em `[0, fixedDt)` após `advance`.

##### Returns

`number`

***

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](../../elements/classes/Entity.md)\<`object`\>[]

Defined in: [src/scene/contracts/Entity.ts:160](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L160)

Lista somente-leitura dos filhos diretos. World.insert traverse essa
árvore recursivamente para coletar todos os Resources de um root.

##### Returns

readonly [`Entity`](../../elements/classes/Entity.md)\<`object`\>[]

#### Inherited from

[`Entity`](../../elements/classes/Entity.md).[`attached`](../../elements/classes/Entity.md#attached)

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

[`Entity`](../../elements/classes/Entity.md).[`data`](../../elements/classes/Entity.md#data)

***

### droppedTime

#### Get Signature

> **get** **droppedTime**(): `number`

Defined in: [src/scene/time/Time.ts:139](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/time/Time.ts#L139)

Tempo de física descartado pelo teto de passos, acumulado (s).

##### Returns

`number`

***

### dt

#### Get Signature

> **get** **dt**(): `number`

Defined in: [src/scene/time/Time.ts:101](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/time/Time.ts#L101)

Duração efetiva do último quadro (s): `realDt × scale`.

##### Returns

`number`

***

### elapsed

#### Get Signature

> **get** **elapsed**(): `number`

Defined in: [src/scene/time/Time.ts:105](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/time/Time.ts#L105)

Soma dos `dt` efetivos (s).

##### Returns

`number`

***

### fixedDt

#### Get Signature

> **get** **fixedDt**(): `number` \| `undefined`

Defined in: [src/scene/time/Time.ts:166](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/time/Time.ts#L166)

Passo fixo da física (s, > 0). `undefined` = passo variável. Default 1/60.

##### Returns

`number` \| `undefined`

#### Set Signature

> **set** **fixedDt**(`value`): `void`

Defined in: [src/scene/time/Time.ts:170](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/time/Time.ts#L170)

Define o passo fixo (s, > 0) ou `undefined` (passo variável, zera o acumulador).

##### Throws

RangeError se ≤ 0.

##### Parameters

###### value

`number` \| `undefined`

##### Returns

`void`

***

### frame

#### Get Signature

> **get** **frame**(): `number`

Defined in: [src/scene/time/Time.ts:109](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/time/Time.ts#L109)

Quadros avançados.

##### Returns

`number`

***

### maxFrameDt

#### Get Signature

> **get** **maxFrameDt**(): `number`

Defined in: [src/scene/time/Time.ts:188](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/time/Time.ts#L188)

Teto da duração real de um quadro (s, > 0). Default 0,25.

##### Returns

`number`

#### Set Signature

> **set** **maxFrameDt**(`value`): `void`

Defined in: [src/scene/time/Time.ts:192](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/time/Time.ts#L192)

Define o teto da duração real do quadro (s, > 0).

##### Throws

RangeError se ≤ 0.

##### Parameters

###### value

`number`

##### Returns

`void`

***

### maxStepsPerFrame

#### Get Signature

> **get** **maxStepsPerFrame**(): `number`

Defined in: [src/scene/time/Time.ts:176](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/time/Time.ts#L176)

Teto de passos de física por quadro (inteiro ≥ 1). Default 4.

##### Returns

`number`

#### Set Signature

> **set** **maxStepsPerFrame**(`value`): `void`

Defined in: [src/scene/time/Time.ts:180](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/time/Time.ts#L180)

Define o teto de passos por quadro (inteiro ≥ 1).

##### Throws

RangeError se inválido.

##### Parameters

###### value

`number`

##### Returns

`void`

***

### physicsScale

#### Get Signature

> **get** **physicsScale**(): `number`

Defined in: [src/scene/time/Time.ts:157](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/time/Time.ts#L157)

Multiplicador só da física (≥ 0), aplicado sobre `scale`.

##### Returns

`number`

#### Set Signature

> **set** **physicsScale**(`value`): `void`

Defined in: [src/scene/time/Time.ts:161](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/time/Time.ts#L161)

Define o multiplicador da física (≥ 0).

##### Throws

RangeError se negativo ou não finito.

##### Parameters

###### value

`number`

##### Returns

`void`

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

[`Entity`](../../elements/classes/Entity.md).[`rawData`](../../elements/classes/Entity.md#rawdata)

***

### realDt

#### Get Signature

> **get** **realDt**(): `number`

Defined in: [src/scene/time/Time.ts:97](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/time/Time.ts#L97)

Duração real do último quadro (s), já limitada a `maxFrameDt`.

##### Returns

`number`

***

### scale

#### Get Signature

> **get** **scale**(): `number`

Defined in: [src/scene/time/Time.ts:148](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/time/Time.ts#L148)

Velocidade global (≥ 0). 0 pausa tudo que depende de `dt`.

##### Returns

`number`

#### Set Signature

> **set** **scale**(`value`): `void`

Defined in: [src/scene/time/Time.ts:152](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/time/Time.ts#L152)

Define a velocidade global (≥ 0); vale a partir do próximo `advance`.

##### Throws

RangeError se negativa ou não finita.

##### Parameters

###### value

`number`

##### Returns

`void`

***

### simulated

#### Get Signature

> **get** **simulated**(): `number`

Defined in: [src/scene/time/Time.ts:125](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/time/Time.ts#L125)

Tempo simulado (s): a soma dos passos da física dados até aqui. Com passo fixo, é `passos × fixedDt` desde a
última troca de passo — a mesma sequência de valores a qualquer taxa de quadros. É o tempo que as funções dos
pontos de extensão recebem (spec 009); pausado, não anda.

##### Returns

`number`

***

### stepDt

#### Get Signature

> **get** **stepDt**(): `number`

Defined in: [src/scene/time/Time.ts:117](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/time/Time.ts#L117)

Duração de cada passo de física do quadro corrente (s).

##### Returns

`number`

***

### steps

#### Get Signature

> **get** **steps**(): `number`

Defined in: [src/scene/time/Time.ts:113](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/time/Time.ts#L113)

Passos de física do quadro corrente.

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

[`Entity`](../../elements/classes/Entity.md)\<`object`\>

#### Returns

`this`

#### Inherited from

[`Entity`](../../elements/classes/Entity.md).[`add`](../../elements/classes/Entity.md#add)

***

### advance()

> **advance**(`realDt`): `void`

Defined in: [src/scene/time/Time.ts:197](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/time/Time.ts#L197)

Avança o relógio um quadro de duração real `realDt` (s, ≥ 0). Ver a regra na documentação da classe.

#### Parameters

##### realDt

`number`

#### Returns

`void`

***

### detach()

> **detach**(`e`): `boolean`

Defined in: [src/scene/contracts/Entity.ts:149](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L149)

Desanexa uma Entity-filha direta (inverso de `add`). Devolve `false` se ela não é filha desta. Numa entidade já
inserida, use `World.detach` (que também atualiza a cena).

#### Parameters

##### e

[`Entity`](../../elements/classes/Entity.md)\<`object`\>

#### Returns

`boolean`

#### Inherited from

[`Entity`](../../elements/classes/Entity.md).[`detach`](../../elements/classes/Entity.md#detach)

***

### getDescriptors()

> **getDescriptors**(): readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

Defined in: [src/scene/time/Time.ts:269](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/time/Time.ts#L269)

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

Defined in: [src/scene/time/Time.ts:273](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/time/Time.ts#L273)

Pipelines GPU declaradas pelo resource (shader e entry points; recursos
pelos módulos declarados). Útil para Materials que carregam shaders próprios.
Vazio para a maioria (Flows criam pipelines diretamente).

#### Returns

readonly [`PipelineDescriptor`](../../platform/web/interfaces/PipelineDescriptor.md)[]

#### Implementation of

[`Resource`](../../platform/web/interfaces/Resource.md).[`getPipelineDescriptors`](../../platform/web/interfaces/Resource.md#getpipelinedescriptors)

***

### pause()

> **pause**(): `void`

Defined in: [src/scene/time/Time.ts:244](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/time/Time.ts#L244)

Pausa tudo (`scale = 0`), guardando a escala para `resume`.

#### Returns

`void`

***

### pausePhysics()

> **pausePhysics**(): `void`

Defined in: [src/scene/time/Time.ts:257](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/time/Time.ts#L257)

Pausa só a física (`physicsScale = 0`); o desenho continua.

#### Returns

`void`

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

`TimeData`

#### Returns

`void`

#### Inherited from

[`Entity`](../../elements/classes/Entity.md).[`redescribe`](../../elements/classes/Entity.md#redescribe)

***

### resume()

> **resume**(): `void`

Defined in: [src/scene/time/Time.ts:251](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/time/Time.ts#L251)

Restaura a escala anterior a `pause`.

#### Returns

`void`

***

### resumePhysics()

> **resumePhysics**(): `void`

Defined in: [src/scene/time/Time.ts:264](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/time/Time.ts#L264)

Restaura a escala da física anterior a `pausePhysics`.

#### Returns

`void`

***

### stepTime()

> **stepTime**(`k`): `number`

Defined in: [src/scene/time/Time.ts:133](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/time/Time.ts#L133)

Tempo simulado no início do passo `k` (0 ≤ k < `steps`) deste quadro (s). Com passo fixo, conta passos inteiros
desde a última troca de passo — o passo de mesma ordem global tem o mesmo tempo em qualquer taxa de quadros (os
solvers o passam às funções dos campos, spec 009).

#### Parameters

##### k

`number`

#### Returns

`number`
