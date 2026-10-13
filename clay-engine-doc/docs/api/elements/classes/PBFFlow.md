[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / PBFFlow

# Class: PBFFlow

Defined in: [elements/physics/flows/PBFFlow.ts:99](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/physics/flows/PBFFlow.ts#L99)

PBFFlow — fluidos por Position Based Fluids. O quadro executa `time.steps × substeps` iterações; cada uma
reconstrói a vizinhança e roda predict → (densidade/λ → correção → aplicação → colisão)×N → velocidade →
vorticidade → XSPH com a sua região de `PBFSimParams` (`dt = stepDt / substeps`, `dt_frame = stepDt`) ligada por
offset dinâmico.

Recursos privados — parâmetros por iteração, correções `pbf_delta`, busca de vizinhança (recriada quando a grade do
material muda) e `ColliderSet` — são preparados e religados em transições, nunca no `dispatch`.

## Extends

- `Flow`\<[`PBFSlots`](../interfaces/PBFSlots.md), `"running"`\>

## Constructors

### Constructor

> **new PBFFlow**(`ctx`, `options?`): `PBFFlow`

Defined in: [elements/physics/flows/PBFFlow.ts:121](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/physics/flows/PBFFlow.ts#L121)

#### Parameters

##### ctx

`FlowContext`

##### options?

[`PBFFlowOptions`](../interfaces/PBFFlowOptions.md) = `{}`

#### Returns

`PBFFlow`

#### Overrides

`Flow<PBFSlots, 'running'>.constructor`

## Properties

### bindings

> `readonly` **bindings**: `BindingSources`

Defined in: [elements/physics/flows/PBFFlow.ts:103](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/physics/flows/PBFFlow.ts#L103)

Bindings privados iniciais por nome de variável WGSL (uniforms por passo, temporários do algoritmo).

#### Overrides

`Flow.bindings`

***

### initialState

> `protected` `readonly` **initialState**: `"running"`

Defined in: [elements/physics/flows/PBFFlow.ts:104](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/physics/flows/PBFFlow.ts#L104)

Estado inicial do algoritmo.

#### Overrides

`Flow.initialState`

***

### listens

> `readonly` **listens**: readonly `Schema`[] = `[]`

Defined in: [scene/flows/Flow.ts:69](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/scene/flows/Flow.ts#L69)

Schemas cujos `resourceReady` o Flow recebe como evento.

#### Inherited from

`Flow.listens`

***

### pipelines

> `readonly` **pipelines**: readonly `PipelineDescriptor`[]

Defined in: [elements/physics/flows/PBFFlow.ts:102](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/physics/flows/PBFFlow.ts#L102)

Pipelines declarados; a C2 os prepara antes de o Flow ficar pronto.

#### Overrides

`Flow.pipelines`

***

### slots

> `readonly` **slots**: [`PBFSlots`](../interfaces/PBFSlots.md)

Defined in: [elements/physics/flows/PBFFlow.ts:101](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/physics/flows/PBFFlow.ts#L101)

Slots consumidos, por nome.

#### Overrides

`Flow.slots`

***

### transitions

> `protected` `readonly` **transitions**: `FlowTransitions`\<`"running"`, `TransitionContext`\<[`PBFSlots`](../interfaces/PBFSlots.md)\>\>

Defined in: [elements/physics/flows/PBFFlow.ts:105](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/physics/flows/PBFFlow.ts#L105)

Tabela de transições (estado × evento).

#### Overrides

`Flow.transitions`

***

### type

> `readonly` **type**: `"PBFFlow"` = `'PBFFlow'`

Defined in: [elements/physics/flows/PBFFlow.ts:100](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/physics/flows/PBFFlow.ts#L100)

Nome explícito do estágio (mensagens, profiling, `flowReady`) — dado, não nome de classe (minificação).

#### Overrides

`Flow.type`

## Accessors

### lifecycle

#### Get Signature

> **get** **lifecycle**(): `FlowLifecycle`

Defined in: [scene/flows/Flow.ts:79](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/scene/flows/Flow.ts#L79)

Estado do ciclo de vida (só a C2 o muda).

##### Returns

`FlowLifecycle`

#### Inherited from

`Flow.lifecycle`

***

### state

#### Get Signature

> **get** **state**(): `S`

Defined in: [scene/flows/Flow.ts:84](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/scene/flows/Flow.ts#L84)

Estado próprio do algoritmo (só transições o mudam).

##### Returns

`S`

#### Inherited from

`Flow.state`

## Methods

### dispatch()

> **dispatch**(`frame`, `bound`): `void`

Defined in: [elements/physics/flows/PBFFlow.ts:206](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/physics/flows/PBFFlow.ts#L206)

Grava as iterações do quadro (decididas em `framePrepare`).

#### Parameters

##### frame

`Frame`

##### bound

`BoundFlow`\<[`PBFSlots`](../interfaces/PBFSlots.md)\>

#### Returns

`void`

#### Overrides

`Flow.dispatch`

***

### dispose()

> **dispose**(): `void`

Defined in: [elements/physics/flows/PBFFlow.ts:248](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/elements/physics/flows/PBFFlow.ts#L248)

Libera parâmetros, correções, colliders e a busca de vizinhança.

#### Returns

`void`

#### Overrides

`Flow.dispose`
