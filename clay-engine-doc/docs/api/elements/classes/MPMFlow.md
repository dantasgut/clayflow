[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / MPMFlow

# Class: MPMFlow

Defined in: [src/elements/physics/flows/MPMFlow.ts:84](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/MPMFlow.ts#L84)

MPMFlow — corpos por Material Point Method (MLS-MPM: limpa grade → P2G → atualização da grade → G2P → colisão):
fluido fracamente compressível (`MPMFluidSchema`) ou sólido neo-Hookean (`MPMSoftSchema`), conforme o `bodyType` do
registro. O quadro executa `time.steps × substeps` iterações, com `substeps` pelo passo estável do
`ParticlePhysics`, cada uma com a sua região de `MPMSimParams` (`dt = stepDt / substeps`, `dt_frame = stepDt`)
ligada por offset dinâmico. Massa, volume, grade (célula 2s sobre o domínio), módulo volumétrico e Lamé vêm do
`ParticlePhysics`.

Slots: pool de partículas, `Time`, `GravityField` e `ParticlePhysics` (opcionais), pools de collider e as
entidades com collider. O espaço de trabalho — grade, parâmetros por iteração e o `ColliderSet` — é do Resource de
trabalho (`MPMWork`, spec 039), redimensionado em transições (`framePrepare` para grade e parâmetros;
entidades/pools para os colliders), nunca no `dispatch`.

## Extends

- [`Flow`](../../platform/web/classes/Flow.md)\<[`MPMSlots`](../interfaces/MPMSlots.md), `"running"`\>

## Constructors

### Constructor

> **new MPMFlow**(`ctx`, `options?`): `MPMFlow`

Defined in: [src/elements/physics/flows/MPMFlow.ts:101](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/MPMFlow.ts#L101)

#### Parameters

##### ctx

[`FlowContext`](../../platform/web/interfaces/FlowContext.md)

##### options?

[`MPMFlowOptions`](../interfaces/MPMFlowOptions.md) = `{}`

#### Returns

`MPMFlow`

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`constructor`](../../platform/web/classes/Flow.md#constructor)

## Properties

### bindings

> `readonly` **bindings**: [`BindingSources`](../../platform/web/type-aliases/BindingSources.md)

Defined in: [src/scene/flows/Flow.ts:79](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L79)

Bindings privados iniciais por recurso declarado (uniforms por passo, temporários do algoritmo).

#### Inherited from

[`Flow`](../../platform/web/classes/Flow.md).[`bindings`](../../platform/web/classes/Flow.md#bindings)

***

### initialState

> `protected` `readonly` **initialState**: `"running"`

Defined in: [src/elements/physics/flows/MPMFlow.ts:88](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/MPMFlow.ts#L88)

Estado inicial do algoritmo.

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`initialState`](../../platform/web/classes/Flow.md#initialstate)

***

### listens

> `readonly` **listens**: readonly [`Listened`](../../platform/web/type-aliases/Listened.md)[] = `[]`

Defined in: [src/scene/flows/Flow.ts:84](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L84)

Schemas (ou famílias de schemas: os registros de um ponto de extensão) cujos `resourceReady` e `poolWritten` o
Flow recebe como evento.

#### Inherited from

[`Flow`](../../platform/web/classes/Flow.md).[`listens`](../../platform/web/classes/Flow.md#listens)

***

### pipelines

> `readonly` **pipelines**: readonly [`PipelineDescriptor`](../../platform/web/interfaces/PipelineDescriptor.md)[]

Defined in: [src/elements/physics/flows/MPMFlow.ts:87](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/MPMFlow.ts#L87)

Pipelines declarados; a C2 os prepara antes de o Flow ficar pronto.

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`pipelines`](../../platform/web/classes/Flow.md#pipelines)

***

### slots

> `readonly` **slots**: [`MPMSlots`](../interfaces/MPMSlots.md)

Defined in: [src/elements/physics/flows/MPMFlow.ts:86](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/MPMFlow.ts#L86)

Slots consumidos, por nome.

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`slots`](../../platform/web/classes/Flow.md#slots)

***

### transitions

> `protected` `readonly` **transitions**: [`FlowTransitions`](../../platform/web/type-aliases/FlowTransitions.md)\<`"running"`, [`TransitionContext`](../../platform/web/interfaces/TransitionContext.md)\<[`MPMSlots`](../interfaces/MPMSlots.md)\>\>

Defined in: [src/elements/physics/flows/MPMFlow.ts:89](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/MPMFlow.ts#L89)

Tabela de transições (estado × evento).

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`transitions`](../../platform/web/classes/Flow.md#transitions)

***

### type

> `readonly` **type**: `"MPMFlow"` = `'MPMFlow'`

Defined in: [src/elements/physics/flows/MPMFlow.ts:85](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/MPMFlow.ts#L85)

Nome explícito do estágio (mensagens, profiling, `flowReady`) — dado, não nome de classe (minificação).

#### Overrides

[`RenderFlow`](../../platform/web/classes/RenderFlow.md).[`type`](../../platform/web/classes/RenderFlow.md#type)

## Accessors

### lifecycle

#### Get Signature

> **get** **lifecycle**(): [`FlowLifecycle`](../../platform/web/type-aliases/FlowLifecycle.md)

Defined in: [src/scene/flows/Flow.ts:94](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L94)

Estado do ciclo de vida (só a C2 o muda).

##### Returns

[`FlowLifecycle`](../../platform/web/type-aliases/FlowLifecycle.md)

#### Inherited from

[`Flow`](../../platform/web/classes/Flow.md).[`lifecycle`](../../platform/web/classes/Flow.md#lifecycle)

***

### state

#### Get Signature

> **get** **state**(): `S`

Defined in: [src/scene/flows/Flow.ts:99](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L99)

Estado próprio do algoritmo (só transições o mudam).

##### Returns

`S`

#### Inherited from

[`Flow`](../../platform/web/classes/Flow.md).[`state`](../../platform/web/classes/Flow.md#state)

## Methods

### dispatch()

> **dispatch**(`frame`, `bound`): `void`

Defined in: [src/elements/physics/flows/MPMFlow.ts:204](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/MPMFlow.ts#L204)

Grava as iterações do quadro (decididas em `framePrepare`).

#### Parameters

##### frame

[`Frame`](../../platform/web/interfaces/Frame.md)

##### bound

[`BoundFlow`](../../platform/web/interfaces/BoundFlow.md)\<[`MPMSlots`](../interfaces/MPMSlots.md)\>

#### Returns

`void`

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`dispatch`](../../platform/web/classes/Flow.md#dispatch)

***

### dispose()

> **dispose**(): `void`

Defined in: [src/scene/flows/Flow.ts:107](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L107)

Libera os recursos privados do Flow. Chamado pela C2 no descarte (`unregister`).

#### Returns

`void`

#### Inherited from

[`Flow`](../../platform/web/classes/Flow.md).[`dispose`](../../platform/web/classes/Flow.md#dispose)
