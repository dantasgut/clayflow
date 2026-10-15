[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / EmitterFlow

# Class: EmitterFlow

Defined in: [elements/particles/EmitterFlow.ts:90](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/particles/EmitterFlow.ts#L90)

EmitterFlow — partículas de `ComputeParticleEmitter` inteiras na GPU (spec 009). A cada passo da física: a CPU
conta as partículas a criar (`rate × stepDt` acumulado, sem leitura de volta — a mesma sequência em qualquer taxa de
quadros); `emit_spawn` cria cada uma no anel pela função `emit_fn` (a forma do emissor, ou a `EmitFunction` da
entidade); `emit_update` envelhece, integra gravidade e campos (ponto `field`) e escreve os vértices da
`PointCloudGeometry` da entidade (a morta vai para longe). A função nova (ou `setCode`) vale quando o pipeline de
criação compila; rejeitada, segue a anterior.

## Extends

- `Flow`\<[`EmitterSlots`](../interfaces/EmitterSlots.md), `"idle"`\>

## Constructors

### Constructor

> **new EmitterFlow**(`ctx`): `EmitterFlow`

Defined in: [elements/particles/EmitterFlow.ts:107](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/particles/EmitterFlow.ts#L107)

#### Parameters

##### ctx

`FlowContext`

#### Returns

`EmitterFlow`

#### Overrides

`Flow<EmitterSlots, 'idle'>.constructor`

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

Defined in: [elements/particles/EmitterFlow.ts:94](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/particles/EmitterFlow.ts#L94)

Estado inicial do algoritmo.

#### Overrides

`Flow.initialState`

***

### listens

> `readonly` **listens**: `StructSchema`[]

Defined in: [elements/particles/EmitterFlow.ts:93](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/particles/EmitterFlow.ts#L93)

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

> `readonly` **slots**: [`EmitterSlots`](../interfaces/EmitterSlots.md)

Defined in: [elements/particles/EmitterFlow.ts:92](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/particles/EmitterFlow.ts#L92)

Slots consumidos, por nome.

#### Overrides

`Flow.slots`

***

### transitions

> `protected` `readonly` **transitions**: `FlowTransitions`\<`"idle"`, `Ctx`\>

Defined in: [elements/particles/EmitterFlow.ts:95](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/particles/EmitterFlow.ts#L95)

Tabela de transições (estado × evento).

#### Overrides

`Flow.transitions`

***

### type

> `readonly` **type**: `"EmitterFlow"` = `'EmitterFlow'`

Defined in: [elements/particles/EmitterFlow.ts:91](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/particles/EmitterFlow.ts#L91)

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

Defined in: [elements/particles/EmitterFlow.ts:172](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/particles/EmitterFlow.ts#L172)

Por passo do quadro e por emissor: criação (se há partículas a criar) e atualização.

#### Parameters

##### frame

`Frame`

##### bound

`BoundFlow`\<[`EmitterSlots`](../interfaces/EmitterSlots.md)\>

#### Returns

`void`

#### Overrides

`Flow.dispatch`

***

### dispose()

> **dispose**(): `void`

Defined in: [elements/particles/EmitterFlow.ts:211](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/particles/EmitterFlow.ts#L211)

Libera os parâmetros dos emissores e o substituto.

#### Returns

`void`

#### Overrides

`Flow.dispose`
