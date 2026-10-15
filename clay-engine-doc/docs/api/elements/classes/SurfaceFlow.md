[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / SurfaceFlow

# Class: SurfaceFlow

Defined in: [elements/geometry/SurfaceFlow.ts:145](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/geometry/SurfaceFlow.ts#L145)

SurfaceFlow — superfícies paramétricas avaliadas na GPU (spec 009): para cada `ParametricSurface`, o kernel
`surface_eval` escreve posição, normal e uv da grade a partir da função `surface` da entidade (`SurfaceFunction`, com
derivadas analíticas quando ela as define) ou da superfície pronta, com o espaço da cena (`SpaceFunction`, composto
pela C2). Avalia quando a superfície entra ou muda, quando a função muda (valores ou código) e a cada quadro com
`animated` ou com espaço na cena. A função nova vale quando o pipeline compila; rejeitada, segue a anterior.

## Extends

- `Flow`\<[`SurfaceSlots`](../interfaces/SurfaceSlots.md), `"idle"`\>

## Constructors

### Constructor

> **new SurfaceFlow**(`ctx`): `SurfaceFlow`

Defined in: [elements/geometry/SurfaceFlow.ts:162](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/geometry/SurfaceFlow.ts#L162)

#### Parameters

##### ctx

`FlowContext`

#### Returns

`SurfaceFlow`

#### Overrides

`Flow<SurfaceSlots, 'idle'>.constructor`

## Properties

### bindings

> `readonly` **bindings**: `BindingSources` = `{}`

Defined in: [scene/flows/Flow.ts:67](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/scene/flows/Flow.ts#L67)

Bindings privados iniciais por nome de variável WGSL (uniforms por passo, temporários do algoritmo).

#### Inherited from

`Flow.bindings`

***

### initialState

> `protected` `readonly` **initialState**: `"idle"`

Defined in: [elements/geometry/SurfaceFlow.ts:149](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/geometry/SurfaceFlow.ts#L149)

Estado inicial do algoritmo.

#### Overrides

`Flow.initialState`

***

### listens

> `readonly` **listens**: `StructSchema`[]

Defined in: [elements/geometry/SurfaceFlow.ts:148](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/geometry/SurfaceFlow.ts#L148)

Schemas cujos `resourceReady` o Flow recebe como evento.

#### Overrides

`Flow.listens`

***

### pipelines

> `readonly` **pipelines**: readonly `PipelineDescriptor`[] = `[]`

Defined in: [scene/flows/Flow.ts:65](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/scene/flows/Flow.ts#L65)

Pipelines declarados; a C2 os prepara antes de o Flow ficar pronto.

#### Inherited from

`Flow.pipelines`

***

### slots

> `readonly` **slots**: [`SurfaceSlots`](../interfaces/SurfaceSlots.md)

Defined in: [elements/geometry/SurfaceFlow.ts:147](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/geometry/SurfaceFlow.ts#L147)

Slots consumidos, por nome.

#### Overrides

`Flow.slots`

***

### transitions

> `protected` `readonly` **transitions**: `FlowTransitions`\<`"idle"`, `Ctx`\>

Defined in: [elements/geometry/SurfaceFlow.ts:150](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/geometry/SurfaceFlow.ts#L150)

Tabela de transições (estado × evento).

#### Overrides

`Flow.transitions`

***

### type

> `readonly` **type**: `"SurfaceFlow"` = `'SurfaceFlow'`

Defined in: [elements/geometry/SurfaceFlow.ts:146](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/geometry/SurfaceFlow.ts#L146)

Nome explícito do estágio (mensagens, profiling, `flowReady`) — dado, não nome de classe (minificação).

#### Overrides

`Flow.type`

## Accessors

### lifecycle

#### Get Signature

> **get** **lifecycle**(): `FlowLifecycle`

Defined in: [scene/flows/Flow.ts:79](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/scene/flows/Flow.ts#L79)

Estado do ciclo de vida (só a C2 o muda).

##### Returns

`FlowLifecycle`

#### Inherited from

`Flow.lifecycle`

***

### state

#### Get Signature

> **get** **state**(): `S`

Defined in: [scene/flows/Flow.ts:84](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/scene/flows/Flow.ts#L84)

Estado próprio do algoritmo (só transições o mudam).

##### Returns

`S`

#### Inherited from

`Flow.state`

## Methods

### dispatch()

> **dispatch**(`frame`, `bound`): `void`

Defined in: [elements/geometry/SurfaceFlow.ts:241](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/geometry/SurfaceFlow.ts#L241)

Uma avaliação por superfície marcada neste quadro.

#### Parameters

##### frame

`Frame`

##### bound

`BoundFlow`\<[`SurfaceSlots`](../interfaces/SurfaceSlots.md)\>

#### Returns

`void`

#### Overrides

`Flow.dispatch`

***

### dispose()

> **dispose**(): `void`

Defined in: [elements/geometry/SurfaceFlow.ts:289](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/geometry/SurfaceFlow.ts#L289)

Libera os parâmetros, os rascunhos e os substitutos.

#### Returns

`void`

#### Overrides

`Flow.dispose`
