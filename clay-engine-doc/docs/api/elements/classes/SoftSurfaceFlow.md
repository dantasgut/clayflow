[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / SoftSurfaceFlow

# Class: SoftSurfaceFlow

Defined in: [elements/physics/flows/SoftSurfaceFlow.ts:65](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/physics/flows/SoftSurfaceFlow.ts#L65)

SoftSurfaceFlow — vértices da superfície dos corpos moles na GPU (spec 008, research R5): a cada quadro, por corpo,
`soft_face_normals` (normal de cada triângulo a partir das posições da faixa do corpo no pool de partículas) e
`soft_vertex_write` (posição e normal média das faces adjacentes no vertex buffer da `SurfaceGeometry`). A geometria
é desenhada pelo forward e pela sombra como qualquer outra; a CPU não envia vértices depois da inserção.

Fase `transform` (depois da física, antes da sombra e do forward). O estágio declara a posse dos vértices (`owns`). Os
kernels são criados quando o corpo entra e recriados quando o pool de partículas cresce (detectado em
`framePrepare`); os parâmetros (uma região por corpo, offset dinâmico) são escritos quando os corpos mudam.

## Extends

- `Flow`\<[`SoftSurfaceSlots`](../interfaces/SoftSurfaceSlots.md), `"idle"`\>

## Constructors

### Constructor

> **new SoftSurfaceFlow**(`ctx`): `SoftSurfaceFlow`

Defined in: [elements/physics/flows/SoftSurfaceFlow.ts:78](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/physics/flows/SoftSurfaceFlow.ts#L78)

#### Parameters

##### ctx

`FlowContext`

#### Returns

`SoftSurfaceFlow`

#### Overrides

`Flow<SoftSurfaceSlots, 'idle'>.constructor`

## Properties

### bindings

> `readonly` **bindings**: `BindingSources` = `{}`

Defined in: [scene/flows/Flow.ts:67](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/scene/flows/Flow.ts#L67)

Bindings privados iniciais por nome de variável WGSL (uniforms por passo, temporários do algoritmo).

#### Inherited from

`Flow.bindings`

***

### initialState

> `protected` `readonly` **initialState**: `"idle"`

Defined in: [elements/physics/flows/SoftSurfaceFlow.ts:68](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/physics/flows/SoftSurfaceFlow.ts#L68)

Estado inicial do algoritmo.

#### Overrides

`Flow.initialState`

***

### listens

> `readonly` **listens**: readonly `Schema`[] = `[]`

Defined in: [scene/flows/Flow.ts:69](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/scene/flows/Flow.ts#L69)

Schemas cujos `resourceReady` o Flow recebe como evento.

#### Inherited from

`Flow.listens`

***

### pipelines

> `readonly` **pipelines**: readonly `PipelineDescriptor`[] = `[]`

Defined in: [scene/flows/Flow.ts:65](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/scene/flows/Flow.ts#L65)

Pipelines declarados; a C2 os prepara antes de o Flow ficar pronto.

#### Inherited from

`Flow.pipelines`

***

### slots

> `readonly` **slots**: [`SoftSurfaceSlots`](../interfaces/SoftSurfaceSlots.md)

Defined in: [elements/physics/flows/SoftSurfaceFlow.ts:67](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/physics/flows/SoftSurfaceFlow.ts#L67)

Slots consumidos, por nome.

#### Overrides

`Flow.slots`

***

### transitions

> `protected` `readonly` **transitions**: `FlowTransitions`\<`"idle"`, `Ctx`\>

Defined in: [elements/physics/flows/SoftSurfaceFlow.ts:69](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/physics/flows/SoftSurfaceFlow.ts#L69)

Tabela de transições (estado × evento).

#### Overrides

`Flow.transitions`

***

### type

> `readonly` **type**: `"SoftSurfaceFlow"` = `'SoftSurfaceFlow'`

Defined in: [elements/physics/flows/SoftSurfaceFlow.ts:66](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/physics/flows/SoftSurfaceFlow.ts#L66)

Nome explícito do estágio (mensagens, profiling, `flowReady`) — dado, não nome de classe (minificação).

#### Overrides

`Flow.type`

## Accessors

### lifecycle

#### Get Signature

> **get** **lifecycle**(): `FlowLifecycle`

Defined in: [scene/flows/Flow.ts:79](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/scene/flows/Flow.ts#L79)

Estado do ciclo de vida (só a C2 o muda).

##### Returns

`FlowLifecycle`

#### Inherited from

`Flow.lifecycle`

***

### state

#### Get Signature

> **get** **state**(): `S`

Defined in: [scene/flows/Flow.ts:84](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/scene/flows/Flow.ts#L84)

Estado próprio do algoritmo (só transições o mudam).

##### Returns

`S`

#### Inherited from

`Flow.state`

## Methods

### dispatch()

> **dispatch**(`frame`, `_bound`): `void`

Defined in: [elements/physics/flows/SoftSurfaceFlow.ts:121](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/physics/flows/SoftSurfaceFlow.ts#L121)

Grava, por corpo, as normais de face e depois os vértices.

#### Parameters

##### frame

`Frame`

##### \_bound

`BoundFlow`\<[`SoftSurfaceSlots`](../interfaces/SoftSurfaceSlots.md)\>

#### Returns

`void`

#### Overrides

`Flow.dispatch`

***

### dispose()

> **dispose**(): `void`

Defined in: [elements/physics/flows/SoftSurfaceFlow.ts:140](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/physics/flows/SoftSurfaceFlow.ts#L140)

Libera kernels, normais de face e parâmetros.

#### Returns

`void`

#### Overrides

`Flow.dispose`
