[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [presentation](../README.md) / PostFlow

# Class: PostFlow

Defined in: [src/presentation/flows/PostFlow.ts:202](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/PostFlow.ts#L202)

PostFlow — cadeia de pós-processamento e apresentação (spec 011): lê a cor HDR da cena (`FrameTargets.color`), aplica
os efeitos ligados em pingue-pongue `rgba16float` (`scene → pp[0] → pp[1] → …`) e termina na **apresentação** no
canvas — exposição, mapeamento de tons, sRGB e pontilhamento (`ToneMapping` da cena). Sem efeitos e com MSAA, a
apresentação lê a cor multiamostrada e mapeia cada amostra antes da média; sem MSAA, lê a cor resolvida.

O espaço de trabalho — as duas texturas de pingue-pongue (do tamanho do canvas, recriadas pela C2 no
redimensionamento), o sampler, um uniform de parâmetros por efeito e o da apresentação — é do `PostWork` (spec 039);
os pipelines (um por efeito, os da apresentação por formato do canvas) são preparados e religados em transições. A saída HDR (`output: 'hdr'`) reconfigura o canvas no
`framePrepare` em que é pedida; sem suporte, cai no padrão e emite `presentationFallback` uma vez.

## Extends

- [`RenderFlow`](../../platform/web/classes/RenderFlow.md)\<[`PostSlots`](../interfaces/PostSlots.md), `"idle"`\>

## Constructors

### Constructor

> **new PostFlow**(`ctx`): `PostFlow`

Defined in: [src/presentation/flows/PostFlow.ts:240](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/PostFlow.ts#L240)

#### Parameters

##### ctx

[`FlowContext`](../../platform/web/interfaces/FlowContext.md)

#### Returns

`PostFlow`

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

Defined in: [src/presentation/flows/PostFlow.ts:205](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/PostFlow.ts#L205)

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

> `readonly` **slots**: [`PostSlots`](../interfaces/PostSlots.md)

Defined in: [src/presentation/flows/PostFlow.ts:204](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/PostFlow.ts#L204)

Slots consumidos, por nome.

#### Overrides

[`RenderFlow`](../../platform/web/classes/RenderFlow.md).[`slots`](../../platform/web/classes/RenderFlow.md#slots)

***

### transitions

> `protected` `readonly` **transitions**: [`FlowTransitions`](../../platform/web/type-aliases/FlowTransitions.md)\<`"idle"`, [`TransitionContext`](../../platform/web/interfaces/TransitionContext.md)\<[`PostSlots`](../interfaces/PostSlots.md)\>\>

Defined in: [src/presentation/flows/PostFlow.ts:206](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/PostFlow.ts#L206)

Tabela de transições (estado × evento).

#### Overrides

[`RenderFlow`](../../platform/web/classes/RenderFlow.md).[`transitions`](../../platform/web/classes/RenderFlow.md#transitions)

***

### type

> `readonly` **type**: `"PostFlow"` = `'PostFlow'`

Defined in: [src/presentation/flows/PostFlow.ts:203](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/PostFlow.ts#L203)

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

### addEffect()

> **addEffect**(`effect`): `this`

Defined in: [src/presentation/flows/PostFlow.ts:299](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/PostFlow.ts#L299)

Empilha um efeito na cadeia (antes da apresentação). A ordem importa: efeitos são aplicados em sequência
(`Bloom → Vignette → …`), todos sobre o HDR; desligar um (`data.enabled = false`) o tira da cadeia sem removê-lo.
Builder fluente.

#### Parameters

##### effect

[`PostProcessEffect`](PostProcessEffect.md)

#### Returns

`this`

***

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

Defined in: [src/presentation/flows/PostFlow.ts:305](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/PostFlow.ts#L305)

Grava os efeitos e a apresentação preparados em `framePrepare`.

#### Parameters

##### frame

[`Frame`](../../platform/web/interfaces/Frame.md)

##### bound

[`BoundFlow`](../../platform/web/interfaces/BoundFlow.md)\<[`PostSlots`](../interfaces/PostSlots.md)\>

#### Returns

`void`

#### Overrides

[`RenderFlow`](../../platform/web/classes/RenderFlow.md).[`dispatch`](../../platform/web/classes/RenderFlow.md#dispatch)

***

### dispose()

> **dispose**(): `void`

Defined in: [src/presentation/flows/PostFlow.ts:382](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/PostFlow.ts#L382)

O pingue-pongue, o sampler e os uniforms são do `PostWork` (a C2 os libera com ele).

#### Returns

`void`

#### Overrides

[`RenderFlow`](../../platform/web/classes/RenderFlow.md).[`dispose`](../../platform/web/classes/RenderFlow.md#dispose)
