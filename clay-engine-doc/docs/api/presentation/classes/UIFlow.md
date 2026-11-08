[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [presentation](../README.md) / UIFlow

# Class: UIFlow

Defined in: [src/presentation/flows/UIFlow.ts:42](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/UIFlow.ts#L42)

UIFlow — desenha a árvore de UI (`UiTree`) por cima do canvas (carrega o conteúdo, `loadOp: 'load'`).

Coordenação: a árvore é achatada em quads (`UiFlattener`/`UiTextLayout`) e enviada em `framePrepare`; o atlas da
fonte, quando muda, é religado na mesma transição. Tela, quads e sampler são do Resource de trabalho (`UIWork`,
spec 039) e o atlas é do `UiGpuPipeline`, ligados pelos recursos declarados (`uiResources`); o pipeline e o bind
group são da C2.

## Extends

- [`RenderFlow`](../../platform/web/classes/RenderFlow.md)\<[`UISlots`](../interfaces/UISlots.md), `"idle"`\>

## Constructors

### Constructor

> **new UIFlow**(`ctx`): `UIFlow`

Defined in: [src/presentation/flows/UIFlow.ts:56](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/UIFlow.ts#L56)

#### Parameters

##### ctx

[`FlowContext`](../../platform/web/interfaces/FlowContext.md)

#### Returns

`UIFlow`

#### Overrides

[`RenderFlow`](../../platform/web/classes/RenderFlow.md).[`constructor`](../../platform/web/classes/RenderFlow.md#constructor)

## Properties

### bindings

> `readonly` **bindings**: [`BindingSources`](../../platform/web/type-aliases/BindingSources.md)

Defined in: [src/scene/flows/Flow.ts:79](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L79)

Bindings privados iniciais por recurso declarado (uniforms por passo, temporários do algoritmo).

#### Inherited from

[`RenderFlow`](../../platform/web/classes/RenderFlow.md).[`bindings`](../../platform/web/classes/RenderFlow.md#bindings)

***

### initialState

> `protected` `readonly` **initialState**: `"idle"`

Defined in: [src/presentation/flows/UIFlow.ts:48](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/UIFlow.ts#L48)

Estado inicial do algoritmo.

#### Overrides

[`RenderFlow`](../../platform/web/classes/RenderFlow.md).[`initialState`](../../platform/web/classes/RenderFlow.md#initialstate)

***

### listens

> `readonly` **listens**: readonly [`Listened`](../../platform/web/type-aliases/Listened.md)[] = `[]`

Defined in: [src/scene/flows/Flow.ts:84](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L84)

Schemas (ou famílias de schemas: os registros de um ponto de extensão) cujos `resourceReady` e `poolWritten` o
Flow recebe como evento.

#### Inherited from

[`RenderFlow`](../../platform/web/classes/RenderFlow.md).[`listens`](../../platform/web/classes/RenderFlow.md#listens)

***

### pipelines

> `readonly` **pipelines**: readonly [`PipelineDescriptor`](../../platform/web/interfaces/PipelineDescriptor.md)[] = `[]`

Defined in: [src/scene/flows/Flow.ts:77](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L77)

Pipelines declarados; a C2 os prepara antes de o Flow ficar pronto.

#### Inherited from

[`RenderFlow`](../../platform/web/classes/RenderFlow.md).[`pipelines`](../../platform/web/classes/RenderFlow.md#pipelines)

***

### slots

> `readonly` **slots**: [`UISlots`](../interfaces/UISlots.md)

Defined in: [src/presentation/flows/UIFlow.ts:44](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/UIFlow.ts#L44)

Slots consumidos, por nome.

#### Overrides

[`RenderFlow`](../../platform/web/classes/RenderFlow.md).[`slots`](../../platform/web/classes/RenderFlow.md#slots)

***

### transitions

> `protected` `readonly` **transitions**: [`FlowTransitions`](../../platform/web/type-aliases/FlowTransitions.md)\<`"idle"`, [`TransitionContext`](../../platform/web/interfaces/TransitionContext.md)\<[`UISlots`](../interfaces/UISlots.md)\>\>

Defined in: [src/presentation/flows/UIFlow.ts:49](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/UIFlow.ts#L49)

Tabela de transições (estado × evento).

#### Overrides

[`RenderFlow`](../../platform/web/classes/RenderFlow.md).[`transitions`](../../platform/web/classes/RenderFlow.md#transitions)

***

### type

> `readonly` **type**: `"UIFlow"` = `'UIFlow'`

Defined in: [src/presentation/flows/UIFlow.ts:43](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/UIFlow.ts#L43)

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

***

### ui

#### Get Signature

> **get** **ui**(): [`UiTree`](UiTree.md)

Defined in: [src/presentation/flows/UIFlow.ts:86](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/UIFlow.ts#L86)

Acesso à árvore de UI — adicione panels/labels/buttons via `ui.add(...)`.

##### Returns

[`UiTree`](UiTree.md)

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

Defined in: [src/presentation/flows/UIFlow.ts:101](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/UIFlow.ts#L101)

Grava os quads enviados em `framePrepare`.

#### Parameters

##### frame

[`Frame`](../../platform/web/interfaces/Frame.md)

##### bound

[`BoundFlow`](../../platform/web/interfaces/BoundFlow.md)\<[`UISlots`](../interfaces/UISlots.md)\>

#### Returns

`void`

#### Overrides

[`RenderFlow`](../../platform/web/classes/RenderFlow.md).[`dispatch`](../../platform/web/classes/RenderFlow.md#dispatch)

***

### dispose()

> **dispose**(): `void`

Defined in: [src/scene/flows/Flow.ts:107](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L107)

Libera os recursos privados do Flow. Chamado pela C2 no descarte (`unregister`).

#### Returns

`void`

#### Inherited from

[`RenderFlow`](../../platform/web/classes/RenderFlow.md).[`dispose`](../../platform/web/classes/RenderFlow.md#dispose)

***

### setFont()

> **setFont**(`font`): `this`

Defined in: [src/presentation/flows/UIFlow.ts:94](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/UIFlow.ts#L94)

Define a fonte usada pelo UI (atlas + texture). Chamado uma vez
após carregar a fonte via `Application.assets.loadFont(url)`.

#### Parameters

##### font

[`LoadedFont`](../interfaces/LoadedFont.md)

#### Returns

`this`
