[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / MPMFlow

# Class: MPMFlow

Defined in: [elements/physics/flows/MPMFlow.ts:83](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/flows/MPMFlow.ts#L83)

MPMFlow — corpos por Material Point Method (MLS-MPM: limpa grade → P2G → atualização da grade → G2P → colisão):
fluido fracamente compressível (`MPMFluidSchema`) ou sólido neo-Hookean (`MPMSoftSchema`), conforme o `bodyType` do
registro. O quadro executa `time.steps × substeps` iterações, com `substeps` pelo passo estável do
`ParticleMaterial`, cada uma com a sua região de `MPMSimParams` (`dt = stepDt / substeps`, `dt_frame = stepDt`)
ligada por offset dinâmico. Massa, volume, grade (célula 2s sobre o domínio), módulo volumétrico e Lamé vêm do
material.

Slots: pool de partículas, `Time`, `GravityField` e `ParticleMaterial` (opcionais), pools de collider e as
entidades com collider. Recursos privados — grade, parâmetros por iteração e o `ColliderSet` — são recriados e
religados em transições (`framePrepare` para grade e parâmetros; entidades/pools para os colliders), nunca no
`dispatch`.

## Extends

- `Flow`\<[`MPMSlots`](../interfaces/MPMSlots.md), `"running"`\>

## Constructors

### Constructor

> **new MPMFlow**(`ctx`, `options?`): `MPMFlow`

Defined in: [elements/physics/flows/MPMFlow.ts:102](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/flows/MPMFlow.ts#L102)

#### Parameters

##### ctx

`FlowContext`

##### options?

[`MPMFlowOptions`](../interfaces/MPMFlowOptions.md) = `{}`

#### Returns

`MPMFlow`

#### Overrides

`Flow<MPMSlots, 'running'>.constructor`

## Properties

### bindings

> `readonly` **bindings**: `BindingSources`

Defined in: [elements/physics/flows/MPMFlow.ts:87](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/flows/MPMFlow.ts#L87)

Bindings privados iniciais por nome de variável WGSL (uniforms por passo, temporários do algoritmo).

#### Overrides

`Flow.bindings`

***

### initialState

> `protected` `readonly` **initialState**: `"running"`

Defined in: [elements/physics/flows/MPMFlow.ts:88](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/flows/MPMFlow.ts#L88)

Estado inicial do algoritmo.

#### Overrides

`Flow.initialState`

***

### listens

> `readonly` **listens**: readonly `Schema`[] = `[]`

Defined in: [scene/flows/Flow.ts:69](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/flows/Flow.ts#L69)

Schemas cujos `resourceReady` o Flow recebe como evento.

#### Inherited from

`Flow.listens`

***

### pipelines

> `readonly` **pipelines**: readonly `PipelineDescriptor`[]

Defined in: [elements/physics/flows/MPMFlow.ts:86](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/flows/MPMFlow.ts#L86)

Pipelines declarados; a C2 os prepara antes de o Flow ficar pronto.

#### Overrides

`Flow.pipelines`

***

### slots

> `readonly` **slots**: [`MPMSlots`](../interfaces/MPMSlots.md)

Defined in: [elements/physics/flows/MPMFlow.ts:85](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/flows/MPMFlow.ts#L85)

Slots consumidos, por nome.

#### Overrides

`Flow.slots`

***

### transitions

> `protected` `readonly` **transitions**: `FlowTransitions`\<`"running"`, `TransitionContext`\<[`MPMSlots`](../interfaces/MPMSlots.md)\>\>

Defined in: [elements/physics/flows/MPMFlow.ts:89](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/flows/MPMFlow.ts#L89)

Tabela de transições (estado × evento).

#### Overrides

`Flow.transitions`

***

### type

> `readonly` **type**: `"MPMFlow"` = `'MPMFlow'`

Defined in: [elements/physics/flows/MPMFlow.ts:84](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/flows/MPMFlow.ts#L84)

Nome explícito do estágio (mensagens, profiling, `flowReady`) — dado, não nome de classe (minificação).

#### Overrides

`Flow.type`

## Accessors

### lifecycle

#### Get Signature

> **get** **lifecycle**(): `FlowLifecycle`

Defined in: [scene/flows/Flow.ts:79](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/flows/Flow.ts#L79)

Estado do ciclo de vida (só a C2 o muda).

##### Returns

`FlowLifecycle`

#### Inherited from

`Flow.lifecycle`

***

### state

#### Get Signature

> **get** **state**(): `S`

Defined in: [scene/flows/Flow.ts:84](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/scene/flows/Flow.ts#L84)

Estado próprio do algoritmo (só transições o mudam).

##### Returns

`S`

#### Inherited from

`Flow.state`

## Methods

### dispatch()

> **dispatch**(`frame`, `bound`): `void`

Defined in: [elements/physics/flows/MPMFlow.ts:191](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/flows/MPMFlow.ts#L191)

Grava as iterações do quadro (decididas em `framePrepare`).

#### Parameters

##### frame

`Frame`

##### bound

`BoundFlow`\<[`MPMSlots`](../interfaces/MPMSlots.md)\>

#### Returns

`void`

#### Overrides

`Flow.dispatch`

***

### dispose()

> **dispose**(): `void`

Defined in: [elements/physics/flows/MPMFlow.ts:226](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/flows/MPMFlow.ts#L226)

Libera parâmetros, grade e colliders.

#### Returns

`void`

#### Overrides

`Flow.dispose`
