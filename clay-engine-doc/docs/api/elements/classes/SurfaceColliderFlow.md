[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / SurfaceColliderFlow

# Class: SurfaceColliderFlow

Defined in: [elements/physics/flows/SurfaceColliderFlow.ts:138](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/flows/SurfaceColliderFlow.ts#L138)

SurfaceColliderFlow — constrói na GPU o campo dos `SurfaceCollider` (spec 010, R2): para cada superfície colidível,
a superfície é avaliada pelo mesmo `surface_at` do desenho (função da entidade ou pronta, espaço da cena) numa grade
de amostragem, e o campo — alturas (rasterização dos triângulos com `atomicMax`) ou distâncias com sinal (semeadura
exata, jump flooding, sinal pela normal) — é escrito no pool do colisor, com a caixa local, a inversa do mundo e a
matriz normal no cabeçalho.

Roda na física antes dos solvers. Superfície que anima (`animated`, espaço na cena ou `TransformFunction`): uma cópia
por passo fixo do quadro, cada uma no tempo do fim do seu passo — os solvers leem a do passo corrente pelo cursor
(mesma trajetória a 30/60/144 Hz). Parada: uma cópia, construída só quando a superfície, o colisor ou o `Transform`
mudam. A função nova vale quando o pipeline compila; rejeitada, o último campo continua.

## Extends

- `Flow`\<[`SurfaceColliderSlots`](../interfaces/SurfaceColliderSlots.md), `"idle"`\>

## Constructors

### Constructor

> **new SurfaceColliderFlow**(`ctx`): `SurfaceColliderFlow`

Defined in: [elements/physics/flows/SurfaceColliderFlow.ts:152](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/flows/SurfaceColliderFlow.ts#L152)

#### Parameters

##### ctx

`FlowContext`

#### Returns

`SurfaceColliderFlow`

#### Overrides

`Flow<SurfaceColliderSlots, 'idle'>.constructor`

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

Defined in: [elements/physics/flows/SurfaceColliderFlow.ts:142](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/flows/SurfaceColliderFlow.ts#L142)

Estado inicial do algoritmo.

#### Overrides

`Flow.initialState`

***

### listens

> `readonly` **listens**: `StructSchema`[]

Defined in: [elements/physics/flows/SurfaceColliderFlow.ts:141](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/flows/SurfaceColliderFlow.ts#L141)

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

> `readonly` **slots**: [`SurfaceColliderSlots`](../interfaces/SurfaceColliderSlots.md)

Defined in: [elements/physics/flows/SurfaceColliderFlow.ts:140](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/flows/SurfaceColliderFlow.ts#L140)

Slots consumidos, por nome.

#### Overrides

`Flow.slots`

***

### transitions

> `protected` `readonly` **transitions**: `FlowTransitions`\<`"idle"`, `Ctx`\>

Defined in: [elements/physics/flows/SurfaceColliderFlow.ts:143](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/flows/SurfaceColliderFlow.ts#L143)

Tabela de transições (estado × evento).

#### Overrides

`Flow.transitions`

***

### type

> `readonly` **type**: `"SurfaceColliderFlow"` = `'SurfaceColliderFlow'`

Defined in: [elements/physics/flows/SurfaceColliderFlow.ts:139](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/flows/SurfaceColliderFlow.ts#L139)

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

Defined in: [elements/physics/flows/SurfaceColliderFlow.ts:235](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/flows/SurfaceColliderFlow.ts#L235)

Grava as passadas dos colliders a construir neste quadro.

#### Parameters

##### frame

`Frame`

##### bound

`BoundFlow`\<[`SurfaceColliderSlots`](../interfaces/SurfaceColliderSlots.md)\>

#### Returns

`void`

#### Overrides

`Flow.dispatch`

***

### dispose()

> **dispose**(): `void`

Defined in: [elements/physics/flows/SurfaceColliderFlow.ts:283](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/elements/physics/flows/SurfaceColliderFlow.ts#L283)

Libera rascunhos, parâmetros e substitutos.

#### Returns

`void`

#### Overrides

`Flow.dispose`
