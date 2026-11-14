[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [presentation](../README.md) / ShadowFlow

# Class: ShadowFlow

Defined in: [src/presentation/flows/ShadowFlow.ts:294](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ShadowFlow.ts#L294)

ShadowFlow — o mapa de sombra virtual da primeira `DirectionalLight` que projeta sombra (spec 034, T060): as páginas
que a imagem pediu no quadro anterior (a série dos pedidos) são alocadas no atlas e só as novas e as tocadas por quem
se moveu ou se deformou são desenhadas; as demais seguem do quadro anterior. Sem texturas (T060h): o atlas é um buffer
por páginas (um alvo só, com o carimbo de cada página e a época da C2, T060a) com a tabela no começo, refeita no lugar a
cada quadro; os pedidos e os retângulos, séries de buffer de duas fatias.

No quadro: a caixa de cada geometria (um despacho por geometria, ligado aos vértices dela), as etapas das páginas
(`shadow_pages.wgsl`: os retângulos das instâncias no plano da luz e quem se moveu, a tabela, as páginas livres, a
alocação do mais grosso ao mais fino até o orçamento do quadro, com o carimbo das páginas escritas, e os pares
instância × página suja, e o fundo das sujas) e o desenho — um desenho indireto por grupo de instâncias (geometria,
orientação) com uma instância por par, do tamanho de uma página, a profundidade no atlas pelo mínimo atômico. A CPU não acompanha a luz nem as páginas: escreve só os
grupos quando mudam e os parâmetros do quadro.

## Extends

- [`Flow`](../../platform/web/classes/Flow.md)\<[`ShadowSlots`](../interfaces/ShadowSlots.md), `"idle"`\>

## Constructors

### Constructor

> **new ShadowFlow**(`ctx`, `options?`): `ShadowFlow`

Defined in: [src/presentation/flows/ShadowFlow.ts:328](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ShadowFlow.ts#L328)

#### Parameters

##### ctx

[`FlowContext`](../../platform/web/interfaces/FlowContext.md)

##### options?

[`ShadowFlowOptions`](../interfaces/ShadowFlowOptions.md) = `{}`

#### Returns

`ShadowFlow`

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

> `protected` `readonly` **initialState**: `"idle"`

Defined in: [src/presentation/flows/ShadowFlow.ts:298](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ShadowFlow.ts#L298)

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

Defined in: [src/presentation/flows/ShadowFlow.ts:297](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ShadowFlow.ts#L297)

Pipelines declarados; a C2 os prepara antes de o Flow ficar pronto.

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`pipelines`](../../platform/web/classes/Flow.md#pipelines)

***

### slots

> `readonly` **slots**: [`ShadowSlots`](../interfaces/ShadowSlots.md)

Defined in: [src/presentation/flows/ShadowFlow.ts:296](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ShadowFlow.ts#L296)

Slots consumidos, por nome.

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`slots`](../../platform/web/classes/Flow.md#slots)

***

### transitions

> `protected` `readonly` **transitions**: [`FlowTransitions`](../../platform/web/type-aliases/FlowTransitions.md)\<`"idle"`, [`TransitionContext`](../../platform/web/interfaces/TransitionContext.md)\<[`ShadowSlots`](../interfaces/ShadowSlots.md)\>\>

Defined in: [src/presentation/flows/ShadowFlow.ts:299](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ShadowFlow.ts#L299)

Tabela de transições (estado × evento).

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`transitions`](../../platform/web/classes/Flow.md#transitions)

***

### type

> `readonly` **type**: `"ShadowFlow"` = `'ShadowFlow'`

Defined in: [src/presentation/flows/ShadowFlow.ts:295](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ShadowFlow.ts#L295)

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

Defined in: [src/presentation/flows/ShadowFlow.ts:399](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ShadowFlow.ts#L399)

As caixas, as etapas das páginas e o desenho das páginas sujas.

#### Parameters

##### frame

[`Frame`](../../platform/web/interfaces/Frame.md)

##### bound

[`BoundFlow`](../../platform/web/interfaces/BoundFlow.md)\<[`ShadowSlots`](../interfaces/ShadowSlots.md)\>

#### Returns

`void`

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`dispatch`](../../platform/web/classes/Flow.md#dispatch)

***

### dispose()

> **dispose**(): `void`

Defined in: [src/presentation/flows/ShadowFlow.ts:489](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ShadowFlow.ts#L489)

O trabalho é do `ShadowWork` (a C2 o libera com ele).

#### Returns

`void`

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`dispose`](../../platform/web/classes/Flow.md#dispose)
