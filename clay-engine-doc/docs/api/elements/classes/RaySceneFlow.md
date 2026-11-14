[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / RaySceneFlow

# Class: RaySceneFlow

Defined in: [src/elements/raytrace/RaySceneFlow.ts:257](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/raytrace/RaySceneFlow.ts#L257)

RaySceneFlow — constrói e mantém a estrutura de raios da cena na GPU (spec 033, R1). Por conteúdo de geometria, uma
hierarquia de baixo: os vértices e os triângulos copiados para os pools da `RayScene`, as caixas, os códigos de
Morton ordenados pela ordenação radix, a hierarquia LBVH e as caixas de baixo para cima. Geometria escrita na GPU
(superfícies, grafos, corpos moles) é reajustada nos quadros em que o seu produtor a marca (`produced('vertices')`):
caixas novas na mesma topologia; com a contagem só na GPU (registro indireto), reconstruída. Por quadro, a hierarquia
de cima sobre as instâncias (as matrizes de mundo lidas na GPU). Nenhuma leitura de volta.

Fase `transform`, depois dos estágios que escrevem geometria (registrado depois deles: o `framePrepare` deles vem
antes). Sem `RayScene` na cena o estágio fica pendente e não custa nada.

## Extends

- [`Flow`](../../platform/web/classes/Flow.md)\<[`RaySceneSlots`](../interfaces/RaySceneSlots.md), `"idle"`\>

## Constructors

### Constructor

> **new RaySceneFlow**(`ctx`): `RaySceneFlow`

Defined in: [src/elements/raytrace/RaySceneFlow.ts:294](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/raytrace/RaySceneFlow.ts#L294)

#### Parameters

##### ctx

[`FlowContext`](../../platform/web/interfaces/FlowContext.md)

#### Returns

`RaySceneFlow`

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

Defined in: [src/elements/raytrace/RaySceneFlow.ts:260](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/raytrace/RaySceneFlow.ts#L260)

Estado inicial do algoritmo.

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`initialState`](../../platform/web/classes/Flow.md#initialstate)

***

### lastFrame

> **lastFrame**: `object`

Defined in: [src/elements/raytrace/RaySceneFlow.ts:437](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/raytrace/RaySceneFlow.ts#L437)

O que o último quadro gravou (para testes e depuração): construções, reajustes e instâncias.

#### built

> **built**: `number`

#### instances

> **instances**: `number`

#### refit

> **refit**: `number`

#### tlasRebuilt

> **tlasRebuilt**: `boolean`

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

> `readonly` **pipelines**: readonly [`PipelineDescriptor`](../../platform/web/interfaces/PipelineDescriptor.md)[] = `[]`

Defined in: [src/scene/flows/Flow.ts:77](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L77)

Pipelines declarados; a C2 os prepara antes de o Flow ficar pronto.

#### Inherited from

[`Flow`](../../platform/web/classes/Flow.md).[`pipelines`](../../platform/web/classes/Flow.md#pipelines)

***

### slots

> `readonly` **slots**: [`RaySceneSlots`](../interfaces/RaySceneSlots.md)

Defined in: [src/elements/raytrace/RaySceneFlow.ts:259](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/raytrace/RaySceneFlow.ts#L259)

Slots consumidos, por nome.

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`slots`](../../platform/web/classes/Flow.md#slots)

***

### transitions

> `protected` `readonly` **transitions**: [`FlowTransitions`](../../platform/web/type-aliases/FlowTransitions.md)\<`"idle"`, `Ctx`\>

Defined in: [src/elements/raytrace/RaySceneFlow.ts:261](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/raytrace/RaySceneFlow.ts#L261)

Tabela de transições (estado × evento).

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`transitions`](../../platform/web/classes/Flow.md#transitions)

***

### type

> `readonly` **type**: `"RaySceneFlow"` = `'RaySceneFlow'`

Defined in: [src/elements/raytrace/RaySceneFlow.ts:258](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/raytrace/RaySceneFlow.ts#L258)

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

> **dispatch**(`frame`, `_bound`): `void`

Defined in: [src/elements/raytrace/RaySceneFlow.ts:361](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/raytrace/RaySceneFlow.ts#L361)

Grava as hierarquias de baixo pendentes ou produzidas e a hierarquia de cima.

#### Parameters

##### frame

[`Frame`](../../platform/web/interfaces/Frame.md)

##### \_bound

[`BoundFlow`](../../platform/web/interfaces/BoundFlow.md)\<[`RaySceneSlots`](../interfaces/RaySceneSlots.md)\>

#### Returns

`void`

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`dispatch`](../../platform/web/classes/Flow.md#dispatch)

***

### dispose()

> **dispose**(): `void`

Defined in: [src/elements/raytrace/RaySceneFlow.ts:449](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/raytrace/RaySceneFlow.ts#L449)

Libera kernels, temporários, a ordenação e os parâmetros.

#### Returns

`void`

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`dispose`](../../platform/web/classes/Flow.md#dispose)
