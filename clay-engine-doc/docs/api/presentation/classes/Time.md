[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / Time

# Class: Time

Defined in: [scene/time/Time.ts:52](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/time/Time.ts#L52)

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

- `Resource`

## Constructors

### Constructor

> **new Time**(`events?`): `Time`

Defined in: [scene/time/Time.ts:83](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/time/Time.ts#L83)

#### Parameters

##### events?

`EventBus`

Barramento onde `timeDropped` é emitido (o da cena). Opcional em testes.

#### Returns

`Time`

#### Overrides

[`Entity`](../../elements/classes/Entity.md).[`constructor`](../../elements/classes/Entity.md#constructor)

## Properties

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [scene/time/Time.ts:61](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/time/Time.ts#L61)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Implementation of

`Resource.state`

***

### schema

> `readonly` `static` **schema**: `StructSchema`

Defined in: [scene/time/Time.ts:54](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/time/Time.ts#L54)

Schema do uniform de GPU: `dt`, `elapsed`, `stepDt` (f32) e `steps` (u32).

## Accessors

### accumulator

#### Get Signature

> **get** **accumulator**(): `number`

Defined in: [scene/time/Time.ts:117](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/time/Time.ts#L117)

Resto de tempo de física para o próximo quadro (s); em `[0, fixedDt)` após `advance`.

##### Returns

`number`

***

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](../../elements/classes/Entity.md)\<`object`\>[]

Defined in: [scene/contracts/Entity.ts:138](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/contracts/Entity.ts#L138)

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

Defined in: [scene/contracts/Entity.ts:90](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/contracts/Entity.ts#L90)

Dados do Resource (o layout é o do schema dos descritores). Na cena, mutações de campo (`data.position = …`,
`data.position[0] = …`) e a reatribuição inteira (`data = …`) marcam o recurso para envio.

##### Returns

`TData`

#### Set Signature

> **set** **data**(`next`): `void`

Defined in: [scene/contracts/Entity.ts:96](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/contracts/Entity.ts#L96)

Troca o dado inteiro; na cena, o recurso inteiro é marcado para envio.

##### Parameters

###### next

`TData`

##### Returns

`void`

#### Implementation of

`Resource.data`

#### Inherited from

[`Entity`](../../elements/classes/Entity.md).[`data`](../../elements/classes/Entity.md#data)

***

### droppedTime

#### Get Signature

> **get** **droppedTime**(): `number`

Defined in: [scene/time/Time.ts:113](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/time/Time.ts#L113)

Tempo de física descartado pelo teto de passos, acumulado (s).

##### Returns

`number`

***

### dt

#### Get Signature

> **get** **dt**(): `number`

Defined in: [scene/time/Time.ts:93](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/time/Time.ts#L93)

Duração efetiva do último quadro (s): `realDt × scale`.

##### Returns

`number`

***

### elapsed

#### Get Signature

> **get** **elapsed**(): `number`

Defined in: [scene/time/Time.ts:97](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/time/Time.ts#L97)

Soma dos `dt` efetivos (s).

##### Returns

`number`

***

### fixedDt

#### Get Signature

> **get** **fixedDt**(): `number` \| `undefined`

Defined in: [scene/time/Time.ts:140](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/time/Time.ts#L140)

Passo fixo da física (s, > 0). `undefined` = passo variável. Default 1/60.

##### Returns

`number` \| `undefined`

#### Set Signature

> **set** **fixedDt**(`value`): `void`

Defined in: [scene/time/Time.ts:144](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/time/Time.ts#L144)

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

Defined in: [scene/time/Time.ts:101](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/time/Time.ts#L101)

Quadros avançados.

##### Returns

`number`

***

### maxFrameDt

#### Get Signature

> **get** **maxFrameDt**(): `number`

Defined in: [scene/time/Time.ts:162](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/time/Time.ts#L162)

Teto da duração real de um quadro (s, > 0). Default 0,25.

##### Returns

`number`

#### Set Signature

> **set** **maxFrameDt**(`value`): `void`

Defined in: [scene/time/Time.ts:166](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/time/Time.ts#L166)

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

Defined in: [scene/time/Time.ts:150](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/time/Time.ts#L150)

Teto de passos de física por quadro (inteiro ≥ 1). Default 4.

##### Returns

`number`

#### Set Signature

> **set** **maxStepsPerFrame**(`value`): `void`

Defined in: [scene/time/Time.ts:154](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/time/Time.ts#L154)

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

Defined in: [scene/time/Time.ts:131](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/time/Time.ts#L131)

Multiplicador só da física (≥ 0), aplicado sobre `scale`.

##### Returns

`number`

#### Set Signature

> **set** **physicsScale**(`value`): `void`

Defined in: [scene/time/Time.ts:135](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/time/Time.ts#L135)

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

Defined in: [scene/contracts/Entity.ts:110](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/contracts/Entity.ts#L110)

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

Defined in: [scene/time/Time.ts:89](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/time/Time.ts#L89)

Duração real do último quadro (s), já limitada a `maxFrameDt`.

##### Returns

`number`

***

### scale

#### Get Signature

> **get** **scale**(): `number`

Defined in: [scene/time/Time.ts:122](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/time/Time.ts#L122)

Velocidade global (≥ 0). 0 pausa tudo que depende de `dt`.

##### Returns

`number`

#### Set Signature

> **set** **scale**(`value`): `void`

Defined in: [scene/time/Time.ts:126](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/time/Time.ts#L126)

Define a velocidade global (≥ 0); vale a partir do próximo `advance`.

##### Throws

RangeError se negativa ou não finita.

##### Parameters

###### value

`number`

##### Returns

`void`

***

### stepDt

#### Get Signature

> **get** **stepDt**(): `number`

Defined in: [scene/time/Time.ts:109](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/time/Time.ts#L109)

Duração de cada passo de física do quadro corrente (s).

##### Returns

`number`

***

### steps

#### Get Signature

> **get** **steps**(): `number`

Defined in: [scene/time/Time.ts:105](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/time/Time.ts#L105)

Passos de física do quadro corrente.

##### Returns

`number`

## Methods

### add()

> **add**(`e`): `this`

Defined in: [scene/contracts/Entity.ts:118](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/contracts/Entity.ts#L118)

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

Defined in: [scene/time/Time.ts:171](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/time/Time.ts#L171)

Avança o relógio um quadro de duração real `realDt` (s, ≥ 0). Ver a regra na documentação da classe.

#### Parameters

##### realDt

`number`

#### Returns

`void`

***

### detach()

> **detach**(`e`): `boolean`

Defined in: [scene/contracts/Entity.ts:127](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/contracts/Entity.ts#L127)

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

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [scene/time/Time.ts:229](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/time/Time.ts#L229)

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

Defined in: [scene/time/Time.ts:233](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/time/Time.ts#L233)

Pipelines GPU declaradas pelo resource (shader source + entry points
+ consumes). Útil para Materials que carregam shaders próprios.
Vazio para a maioria (Flows criam pipelines diretamente).

#### Returns

readonly `PipelineDescriptor`[]

#### Implementation of

`Resource.getPipelineDescriptors`

***

### pause()

> **pause**(): `void`

Defined in: [scene/time/Time.ts:204](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/time/Time.ts#L204)

Pausa tudo (`scale = 0`), guardando a escala para `resume`.

#### Returns

`void`

***

### pausePhysics()

> **pausePhysics**(): `void`

Defined in: [scene/time/Time.ts:217](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/time/Time.ts#L217)

Pausa só a física (`physicsScale = 0`); o desenho continua.

#### Returns

`void`

***

### resume()

> **resume**(): `void`

Defined in: [scene/time/Time.ts:211](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/time/Time.ts#L211)

Restaura a escala anterior a `pause`.

#### Returns

`void`

***

### resumePhysics()

> **resumePhysics**(): `void`

Defined in: [scene/time/Time.ts:224](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/time/Time.ts#L224)

Restaura a escala da física anterior a `pausePhysics`.

#### Returns

`void`
