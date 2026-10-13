[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / SPHFlow

# Class: SPHFlow

Defined in: [elements/physics/flows/SPHFlow.ts:80](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/physics/flows/SPHFlow.ts#L80)

SPHFlow — fluidos por Smoothed Particle Hydrodynamics fracamente compressível (Tait). O quadro executa
`time.steps × substeps` iterações, com `substeps` pelo passo estável do `ParticleMaterial` (CFL 0,4 h/c); cada
uma reconstrói a vizinhança (raio = suporte 2h) e roda densidade → pressão → forças → integração → colisão com a
sua região de `SPHSimParams` (`dt = stepDt / substeps`, `dt_frame = stepDt`) ligada por offset dinâmico. Massa,
suavização, rigidez, viscosidade, restituição e domínio vêm do material.

Recursos privados — parâmetros por iteração, busca de vizinhança (recriada quando a grade do material muda) e
`ColliderSet` — são preparados e religados em transições (`framePrepare`, entidades e pools de collider), nunca no
`dispatch`.

## Extends

- `Flow`\<[`SPHSlots`](../interfaces/SPHSlots.md), `"running"`\>

## Constructors

### Constructor

> **new SPHFlow**(`ctx`, `options?`): `SPHFlow`

Defined in: [elements/physics/flows/SPHFlow.ts:99](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/physics/flows/SPHFlow.ts#L99)

#### Parameters

##### ctx

`FlowContext`

##### options?

[`SPHFlowOptions`](../interfaces/SPHFlowOptions.md) = `{}`

#### Returns

`SPHFlow`

#### Overrides

`Flow<SPHSlots, 'running'>.constructor`

## Properties

### bindings

> `readonly` **bindings**: `BindingSources`

Defined in: [elements/physics/flows/SPHFlow.ts:84](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/physics/flows/SPHFlow.ts#L84)

Bindings privados iniciais por nome de variável WGSL (uniforms por passo, temporários do algoritmo).

#### Overrides

`Flow.bindings`

***

### initialState

> `protected` `readonly` **initialState**: `"running"`

Defined in: [elements/physics/flows/SPHFlow.ts:85](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/physics/flows/SPHFlow.ts#L85)

Estado inicial do algoritmo.

#### Overrides

`Flow.initialState`

***

### listens

> `readonly` **listens**: readonly `Schema`[] = `[]`

Defined in: [scene/flows/Flow.ts:69](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/scene/flows/Flow.ts#L69)

Schemas cujos `resourceReady` o Flow recebe como evento.

#### Inherited from

`Flow.listens`

***

### pipelines

> `readonly` **pipelines**: readonly `PipelineDescriptor`[]

Defined in: [elements/physics/flows/SPHFlow.ts:83](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/physics/flows/SPHFlow.ts#L83)

Pipelines declarados; a C2 os prepara antes de o Flow ficar pronto.

#### Overrides

`Flow.pipelines`

***

### slots

> `readonly` **slots**: [`SPHSlots`](../interfaces/SPHSlots.md)

Defined in: [elements/physics/flows/SPHFlow.ts:82](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/physics/flows/SPHFlow.ts#L82)

Slots consumidos, por nome.

#### Overrides

`Flow.slots`

***

### transitions

> `protected` `readonly` **transitions**: `FlowTransitions`\<`"running"`, `TransitionContext`\<[`SPHSlots`](../interfaces/SPHSlots.md)\>\>

Defined in: [elements/physics/flows/SPHFlow.ts:86](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/physics/flows/SPHFlow.ts#L86)

Tabela de transições (estado × evento).

#### Overrides

`Flow.transitions`

***

### type

> `readonly` **type**: `"SPHFlow"` = `'SPHFlow'`

Defined in: [elements/physics/flows/SPHFlow.ts:81](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/physics/flows/SPHFlow.ts#L81)

Nome explícito do estágio (mensagens, profiling, `flowReady`) — dado, não nome de classe (minificação).

#### Overrides

`Flow.type`

## Accessors

### lifecycle

#### Get Signature

> **get** **lifecycle**(): `FlowLifecycle`

Defined in: [scene/flows/Flow.ts:79](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/scene/flows/Flow.ts#L79)

Estado do ciclo de vida (só a C2 o muda).

##### Returns

`FlowLifecycle`

#### Inherited from

`Flow.lifecycle`

***

### state

#### Get Signature

> **get** **state**(): `S`

Defined in: [scene/flows/Flow.ts:84](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/scene/flows/Flow.ts#L84)

Estado próprio do algoritmo (só transições o mudam).

##### Returns

`S`

#### Inherited from

`Flow.state`

## Methods

### dispatch()

> **dispatch**(`frame`, `bound`): `void`

Defined in: [elements/physics/flows/SPHFlow.ts:169](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/physics/flows/SPHFlow.ts#L169)

Grava as iterações do quadro (decididas em `framePrepare`).

#### Parameters

##### frame

`Frame`

##### bound

`BoundFlow`\<[`SPHSlots`](../interfaces/SPHSlots.md)\>

#### Returns

`void`

#### Overrides

`Flow.dispatch`

***

### dispose()

> **dispose**(): `void`

Defined in: [elements/physics/flows/SPHFlow.ts:199](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/physics/flows/SPHFlow.ts#L199)

Libera parâmetros, colliders e a busca de vizinhança.

#### Returns

`void`

#### Overrides

`Flow.dispose`
