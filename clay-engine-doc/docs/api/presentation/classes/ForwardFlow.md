[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [presentation](../README.md) / ForwardFlow

# Class: ForwardFlow

Defined in: [src/presentation/flows/ForwardFlow.ts:328](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ForwardFlow.ts#L328)

ForwardFlow — o render principal: desenha as entidades com geometria, material e transform.

Tudo vem do que a C2 já alocou, sem objeto de GPU por entidade, pelos recursos declarados dos shaders de material
(spec 031): as matrizes das câmeras (`frame`), o mundo, o registro `Renderable` e a lista de instâncias dos grupos
(`stage`), o pool do material do shader (`batch`) e, nos sprites e no arame, os vértices da geometria do pipeline
(`draw`). A luz, a sombra e a água chegam pelos pontos de cena dos shaders — o estágio não as conhece.

Um desenho por grupo de instâncias (spec 007): entidades com a mesma geometria (mesmo conteúdo), o mesmo shader de
material e a mesma orientação de faces saem numa chamada `draw.indexed(índices, instâncias, 0, 0, início do
grupo)`; os grupos são mantidos pela C2 por eventos, e a gravação não percorre entidades. Os grupos 0, 1 e 3 são
religados só quando mudam (por frequência); pipeline e material só quando o pipeline muda. Um pipeline
por shader de material e orientação de faces (escala espelhada ⇒ `frontFace: 'cw'`), preparado numa transição
quando o material entra na cena. Recursos privados (parâmetros do quadro, substituto da geometria diferencial) são
religados em transições.

## Extends

- [`RenderFlow`](../../platform/web/classes/RenderFlow.md)\<[`ForwardSlots`](../interfaces/ForwardSlots.md), `"idle"`\>

## Constructors

### Constructor

> **new ForwardFlow**(`ctx`, `options?`): `ForwardFlow`

Defined in: [src/presentation/flows/ForwardFlow.ts:567](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ForwardFlow.ts#L567)

#### Parameters

##### ctx

[`FlowContext`](../../platform/web/interfaces/FlowContext.md)

##### options?

[`ForwardFlowOptions`](../interfaces/ForwardFlowOptions.md) = `{}`

#### Returns

`ForwardFlow`

#### Overrides

[`RenderFlow`](../../platform/web/classes/RenderFlow.md).[`constructor`](../../platform/web/classes/RenderFlow.md#constructor)

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

Defined in: [src/presentation/flows/ForwardFlow.ts:333](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ForwardFlow.ts#L333)

Estado inicial do algoritmo.

#### Overrides

[`RenderFlow`](../../platform/web/classes/RenderFlow.md).[`initialState`](../../platform/web/classes/RenderFlow.md#initialstate)

***

### listens

> `readonly` **listens**: [`WgslPoint`](../../platform/web/interfaces/WgslPoint.md)[]

Defined in: [src/presentation/flows/ForwardFlow.ts:332](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ForwardFlow.ts#L332)

Os registros de todas as formas das funções `material` (spec 031, R8).

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`listens`](../../platform/web/classes/Flow.md#listens)

***

### pipelines

> `readonly` **pipelines**: readonly [`PipelineDescriptor`](../../platform/web/interfaces/PipelineDescriptor.md)[] = `[]`

Defined in: [src/scene/flows/Flow.ts:77](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L77)

Pipelines declarados; a C2 os prepara antes de o Flow ficar pronto.

#### Inherited from

[`Flow`](../../platform/web/classes/Flow.md).[`pipelines`](../../platform/web/classes/Flow.md#pipelines)

***

### profileTimestamps

> **profileTimestamps**: `boolean` = `false`

Defined in: [src/presentation/flows/ForwardFlow.ts:408](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ForwardFlow.ts#L408)

Quando true, o passe grava os timestamps do profiler (`timestamp-query`); sem a feature, nada muda.

***

### slots

> `readonly` **slots**: [`ForwardSlots`](../interfaces/ForwardSlots.md)

Defined in: [src/presentation/flows/ForwardFlow.ts:330](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ForwardFlow.ts#L330)

Slots consumidos, por nome.

#### Overrides

[`RenderFlow`](../../platform/web/classes/RenderFlow.md).[`slots`](../../platform/web/classes/RenderFlow.md#slots)

***

### transitions

> `protected` `readonly` **transitions**: [`FlowTransitions`](../../platform/web/type-aliases/FlowTransitions.md)\<`"idle"`, [`TransitionContext`](../../platform/web/interfaces/TransitionContext.md)\<[`ForwardSlots`](../interfaces/ForwardSlots.md)\>\>

Defined in: [src/presentation/flows/ForwardFlow.ts:334](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ForwardFlow.ts#L334)

Tabela de transições (estado × evento).

#### Overrides

[`RenderFlow`](../../platform/web/classes/RenderFlow.md).[`transitions`](../../platform/web/classes/RenderFlow.md#transitions)

***

### type

> `readonly` **type**: `"ForwardFlow"` = `'ForwardFlow'`

Defined in: [src/presentation/flows/ForwardFlow.ts:329](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ForwardFlow.ts#L329)

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

[`RenderFlow`](../../platform/web/classes/RenderFlow.md).[`lifecycle`](../../platform/web/classes/RenderFlow.md#lifecycle)

***

### state

#### Get Signature

> **get** **state**(): `S`

Defined in: [src/scene/flows/Flow.ts:99](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L99)

Estado próprio do algoritmo (só transições o mudam).

##### Returns

`S`

#### Inherited from

[`RenderFlow`](../../platform/web/classes/RenderFlow.md).[`state`](../../platform/web/classes/RenderFlow.md#state)

## Methods

### colorAttachment()

> `protected` **colorAttachment**(`frame`, `target`, `load`): `ColorAttachment` \| `undefined`

Defined in: [src/scene/flows/RenderFlow.ts:29](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/RenderFlow.ts#L29)

Anexo de cor do alvo (spec 008): com amostras (MSAA), desenha na textura de amostras — guardada, para um passe
seguinte carregar — e resolve na cor; sem elas, desenha direto na cor. `undefined` sem cor.

#### Parameters

##### frame

[`Frame`](../../platform/web/interfaces/Frame.md)

##### target

[`BoundTarget`](../../platform/web/interfaces/BoundTarget.md)

##### load

\{ `loadOp`: `"load"`; \} \| \{ `clearValue`: readonly \[`number`, `number`, `number`, `number`\]; `loadOp`: `"clear"`; \}

#### Returns

`ColorAttachment` \| `undefined`

#### Inherited from

[`RenderFlow`](../../platform/web/classes/RenderFlow.md).[`colorAttachment`](../../platform/web/classes/RenderFlow.md#colorattachment)

***

### colorView()

> `protected` **colorView**(`frame`, `target`): [`TextureViewSpec`](../../platform/web/interfaces/TextureViewSpec.md) \| `undefined`

Defined in: [src/scene/flows/RenderFlow.ts:20](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/RenderFlow.ts#L20)

View de cor do alvo resolvido neste quadro (`frame.canvasView` para o canvas; `undefined` sem cor).

#### Parameters

##### frame

[`Frame`](../../platform/web/interfaces/Frame.md)

##### target

[`BoundTarget`](../../platform/web/interfaces/BoundTarget.md)

#### Returns

[`TextureViewSpec`](../../platform/web/interfaces/TextureViewSpec.md) \| `undefined`

#### Inherited from

[`RenderFlow`](../../platform/web/classes/RenderFlow.md).[`colorView`](../../platform/web/classes/RenderFlow.md#colorview)

***

### dispatch()

> **dispatch**(`frame`, `bound`): `void`

Defined in: [src/presentation/flows/ForwardFlow.ts:680](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ForwardFlow.ts#L680)

Grava o passe principal: um desenho por grupo de instâncias; grupos de bind compartilhados uma vez; pipeline e
grupo do material só quando o pipeline muda. Os transmissivos (spec 011) saem do passe principal: depois dele, com
a `Refraction`, marcam o pedido da refração (spec 034) — a cor deles vem do traçado e da composição, depois deste
estágio — e, com o antisserrilhado temporal, o movimento da superfície na profundidade do pedido.

#### Parameters

##### frame

[`Frame`](../../platform/web/interfaces/Frame.md)

##### bound

[`BoundFlow`](../../platform/web/interfaces/BoundFlow.md)\<[`ForwardSlots`](../interfaces/ForwardSlots.md)\>

#### Returns

`void`

#### Overrides

[`RenderFlow`](../../platform/web/classes/RenderFlow.md).[`dispatch`](../../platform/web/classes/RenderFlow.md#dispatch)

***

### dispose()

> **dispose**(): `void`

Defined in: [src/presentation/flows/ForwardFlow.ts:1043](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ForwardFlow.ts#L1043)

Os parâmetros, o substituto e os argumentos são do `ForwardWork` (a C2 os libera com ele).

#### Returns

`void`

#### Overrides

[`RenderFlow`](../../platform/web/classes/RenderFlow.md).[`dispose`](../../platform/web/classes/RenderFlow.md#dispose)
