[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / Time

# Class: Time

Defined in: [scene/time/Time.ts:44](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/time/Time.ts#L44)

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

- [`Entity`](../../elements/classes/Entity.md)

## Implements

- `Resource`

## Constructors

### Constructor

> **new Time**(`events?`): `Time`

Defined in: [scene/time/Time.ts:76](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/time/Time.ts#L76)

#### Parameters

##### events?

`EventBus`

Barramento onde `timeDropped` é emitido (o da cena). Opcional em testes.

#### Returns

`Time`

#### Overrides

[`Entity`](../../elements/classes/Entity.md).[`constructor`](../../elements/classes/Entity.md#constructor)

## Properties

### data

> **data**: `Record`\<`string`, `unknown`\>

Defined in: [scene/time/Time.ts:54](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/time/Time.ts#L54)

Dados runtime do resource (e.g. Camera position, Material albedo,
RigidBody mass). Schema é declarado em `getDescriptors()[i].schema`.
Mutações devem disparar evento `resourceDirty` para re-upload.

#### Implementation of

`Resource.data`

***

### state

> **state**: `ResourceState` = `ResourceState.Uninitialized`

Defined in: [scene/time/Time.ts:53](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/time/Time.ts#L53)

Estado atual do lifecycle (gerenciado por ResourceSystem).

#### Implementation of

`Resource.state`

***

### schema

> `readonly` `static` **schema**: `StructSchema`

Defined in: [scene/time/Time.ts:46](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/time/Time.ts#L46)

Schema do uniform de GPU: `dt`, `elapsed`, `stepDt` (f32) e `steps` (u32).

## Accessors

### accumulator

#### Get Signature

> **get** **accumulator**(): `number`

Defined in: [scene/time/Time.ts:110](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/time/Time.ts#L110)

Resto de tempo de física para o próximo quadro (s); em `[0, fixedDt)` após `advance`.

##### Returns

`number`

***

### attached

#### Get Signature

> **get** **attached**(): readonly [`Entity`](../../elements/classes/Entity.md)[]

Defined in: [scene/contracts/Entity.ts:41](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/contracts/Entity.ts#L41)

Lista somente-leitura dos filhos diretos. World.insert traverse essa
árvore recursivamente para coletar todos os Resources de um root.

##### Returns

readonly [`Entity`](../../elements/classes/Entity.md)[]

#### Inherited from

[`Entity`](../../elements/classes/Entity.md).[`attached`](../../elements/classes/Entity.md#attached)

***

### droppedTime

#### Get Signature

> **get** **droppedTime**(): `number`

Defined in: [scene/time/Time.ts:106](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/time/Time.ts#L106)

Tempo de física descartado pelo teto de passos, acumulado (s).

##### Returns

`number`

***

### dt

#### Get Signature

> **get** **dt**(): `number`

Defined in: [scene/time/Time.ts:86](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/time/Time.ts#L86)

Duração efetiva do último quadro (s): `realDt × scale`.

##### Returns

`number`

***

### elapsed

#### Get Signature

> **get** **elapsed**(): `number`

Defined in: [scene/time/Time.ts:90](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/time/Time.ts#L90)

Soma dos `dt` efetivos (s).

##### Returns

`number`

***

### fixedDt

#### Get Signature

> **get** **fixedDt**(): `number` \| `undefined`

Defined in: [scene/time/Time.ts:133](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/time/Time.ts#L133)

Passo fixo da física (s, > 0). `undefined` = passo variável. Default 1/60.

##### Returns

`number` \| `undefined`

#### Set Signature

> **set** **fixedDt**(`value`): `void`

Defined in: [scene/time/Time.ts:137](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/time/Time.ts#L137)

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

Defined in: [scene/time/Time.ts:94](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/time/Time.ts#L94)

Quadros avançados.

##### Returns

`number`

***

### maxFrameDt

#### Get Signature

> **get** **maxFrameDt**(): `number`

Defined in: [scene/time/Time.ts:155](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/time/Time.ts#L155)

Teto da duração real de um quadro (s, > 0). Default 0,25.

##### Returns

`number`

#### Set Signature

> **set** **maxFrameDt**(`value`): `void`

Defined in: [scene/time/Time.ts:159](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/time/Time.ts#L159)

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

Defined in: [scene/time/Time.ts:143](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/time/Time.ts#L143)

Teto de passos de física por quadro (inteiro ≥ 1). Default 4.

##### Returns

`number`

#### Set Signature

> **set** **maxStepsPerFrame**(`value`): `void`

Defined in: [scene/time/Time.ts:147](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/time/Time.ts#L147)

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

Defined in: [scene/time/Time.ts:124](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/time/Time.ts#L124)

Multiplicador só da física (≥ 0), aplicado sobre `scale`.

##### Returns

`number`

#### Set Signature

> **set** **physicsScale**(`value`): `void`

Defined in: [scene/time/Time.ts:128](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/time/Time.ts#L128)

Define o multiplicador da física (≥ 0).

##### Throws

RangeError se negativo ou não finito.

##### Parameters

###### value

`number`

##### Returns

`void`

***

### realDt

#### Get Signature

> **get** **realDt**(): `number`

Defined in: [scene/time/Time.ts:82](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/time/Time.ts#L82)

Duração real do último quadro (s), já limitada a `maxFrameDt`.

##### Returns

`number`

***

### scale

#### Get Signature

> **get** **scale**(): `number`

Defined in: [scene/time/Time.ts:115](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/time/Time.ts#L115)

Velocidade global (≥ 0). 0 pausa tudo que depende de `dt`.

##### Returns

`number`

#### Set Signature

> **set** **scale**(`value`): `void`

Defined in: [scene/time/Time.ts:119](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/time/Time.ts#L119)

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

Defined in: [scene/time/Time.ts:102](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/time/Time.ts#L102)

Duração de cada passo de física do quadro corrente (s).

##### Returns

`number`

***

### steps

#### Get Signature

> **get** **steps**(): `number`

Defined in: [scene/time/Time.ts:98](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/time/Time.ts#L98)

Passos de física do quadro corrente.

##### Returns

`number`

## Methods

### add()

> **add**(`e`): `this`

Defined in: [scene/contracts/Entity.ts:32](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/contracts/Entity.ts#L32)

Anexa uma Entity-filha. Retorna `this` para chaining fluente.
Não valida ciclos nem múltiplos pais — responsabilidade do caller.

#### Parameters

##### e

[`Entity`](../../elements/classes/Entity.md)

#### Returns

`this`

#### Inherited from

[`Entity`](../../elements/classes/Entity.md).[`add`](../../elements/classes/Entity.md#add)

***

### advance()

> **advance**(`realDt`): `void`

Defined in: [scene/time/Time.ts:164](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/time/Time.ts#L164)

Avança o relógio um quadro de duração real `realDt` (s, ≥ 0). Ver a regra na documentação da classe.

#### Parameters

##### realDt

`number`

#### Returns

`void`

***

### getDescriptors()

> **getDescriptors**(): readonly `GPUDescriptor`[]

Defined in: [scene/time/Time.ts:222](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/time/Time.ts#L222)

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

Defined in: [scene/time/Time.ts:226](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/time/Time.ts#L226)

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

Defined in: [scene/time/Time.ts:197](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/time/Time.ts#L197)

Pausa tudo (`scale = 0`), guardando a escala para `resume`.

#### Returns

`void`

***

### pausePhysics()

> **pausePhysics**(): `void`

Defined in: [scene/time/Time.ts:210](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/time/Time.ts#L210)

Pausa só a física (`physicsScale = 0`); o desenho continua.

#### Returns

`void`

***

### resume()

> **resume**(): `void`

Defined in: [scene/time/Time.ts:204](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/time/Time.ts#L204)

Restaura a escala anterior a `pause`.

#### Returns

`void`

***

### resumePhysics()

> **resumePhysics**(): `void`

Defined in: [scene/time/Time.ts:217](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/time/Time.ts#L217)

Restaura a escala da física anterior a `pausePhysics`.

#### Returns

`void`
