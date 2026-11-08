[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / RenderFlow

# Abstract Class: RenderFlow\<TSlots, S\>

Defined in: [src/scene/flows/RenderFlow.ts:15](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/RenderFlow.ts#L15)

Flow de render: o alvo (`slots.target`) é um slot como os demais — o canvas do quadro, a cor da cena
(`FrameTargets`) ou a profundidade de um `ShadowMap` —, resolvido pela C2 e recriado com o canvas (FR-005).

## Extends

- [`Flow`](Flow.md)\<`TSlots`, `S`\>

## Extended by

- [`ForwardFlow`](../../../presentation/classes/ForwardFlow.md)
- [`ParticleFlow`](../../../presentation/classes/ParticleFlow.md)
- [`PostFlow`](../../../presentation/classes/PostFlow.md)
- [`UIFlow`](../../../presentation/classes/UIFlow.md)

## Type Parameters

### TSlots

`TSlots` *extends* [`RenderSlotMap`](../type-aliases/RenderSlotMap.md) = [`RenderSlotMap`](../type-aliases/RenderSlotMap.md)

### S

`S` *extends* `string` = `string`

## Constructors

### Constructor

> **new RenderFlow**\<`TSlots`, `S`\>(): `RenderFlow`\<`TSlots`, `S`\>

#### Returns

`RenderFlow`\<`TSlots`, `S`\>

#### Inherited from

[`Flow`](Flow.md).[`constructor`](Flow.md#constructor)

## Properties

### bindings

> `readonly` **bindings**: [`BindingSources`](../type-aliases/BindingSources.md)

Defined in: [src/scene/flows/Flow.ts:79](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L79)

Bindings privados iniciais por recurso declarado (uniforms por passo, temporários do algoritmo).

#### Inherited from

[`Flow`](Flow.md).[`bindings`](Flow.md#bindings)

***

### initialState

> `abstract` `protected` `readonly` **initialState**: `S`

Defined in: [src/scene/flows/Flow.ts:86](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L86)

Estado inicial do algoritmo.

#### Inherited from

[`Flow`](Flow.md).[`initialState`](Flow.md#initialstate)

***

### listens

> `readonly` **listens**: readonly [`Listened`](../type-aliases/Listened.md)[] = `[]`

Defined in: [src/scene/flows/Flow.ts:84](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L84)

Schemas (ou famílias de schemas: os registros de um ponto de extensão) cujos `resourceReady` e `poolWritten` o
Flow recebe como evento.

#### Inherited from

[`Flow`](Flow.md).[`listens`](Flow.md#listens)

***

### pipelines

> `readonly` **pipelines**: readonly [`PipelineDescriptor`](../interfaces/PipelineDescriptor.md)[] = `[]`

Defined in: [src/scene/flows/Flow.ts:77](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L77)

Pipelines declarados; a C2 os prepara antes de o Flow ficar pronto.

#### Inherited from

[`Flow`](Flow.md).[`pipelines`](Flow.md#pipelines)

***

### slots

> `abstract` `readonly` **slots**: `TSlots`

Defined in: [src/scene/flows/Flow.ts:75](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L75)

Slots consumidos, por nome.

#### Inherited from

[`Flow`](Flow.md).[`slots`](Flow.md#slots)

***

### transitions

> `abstract` `protected` `readonly` **transitions**: [`FlowTransitions`](../type-aliases/FlowTransitions.md)\<`S`, [`TransitionContext`](../interfaces/TransitionContext.md)\<`TSlots`\>\>

Defined in: [src/scene/flows/Flow.ts:88](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L88)

Tabela de transições (estado × evento).

#### Inherited from

[`Flow`](Flow.md).[`transitions`](Flow.md#transitions)

***

### type

> `abstract` `readonly` **type**: `string`

Defined in: [src/scene/flows/Flow.ts:73](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L73)

Nome explícito do estágio (mensagens, profiling, `flowReady`) — dado, não nome de classe (minificação).

#### Inherited from

`RenderFlow`.[`type`](#type)

## Accessors

### lifecycle

#### Get Signature

> **get** **lifecycle**(): [`FlowLifecycle`](../type-aliases/FlowLifecycle.md)

Defined in: [src/scene/flows/Flow.ts:94](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L94)

Estado do ciclo de vida (só a C2 o muda).

##### Returns

[`FlowLifecycle`](../type-aliases/FlowLifecycle.md)

#### Inherited from

[`Flow`](Flow.md).[`lifecycle`](Flow.md#lifecycle)

***

### state

#### Get Signature

> **get** **state**(): `S`

Defined in: [src/scene/flows/Flow.ts:99](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L99)

Estado próprio do algoritmo (só transições o mudam).

##### Returns

`S`

#### Inherited from

[`Flow`](Flow.md).[`state`](Flow.md#state)

## Methods

### colorAttachment()

> `protected` **colorAttachment**(`frame`, `target`, `load`): `ColorAttachment` \| `undefined`

Defined in: [src/scene/flows/RenderFlow.ts:29](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/RenderFlow.ts#L29)

Anexo de cor do alvo (spec 008): com amostras (MSAA), desenha na textura de amostras — guardada, para um passe
seguinte carregar — e resolve na cor; sem elas, desenha direto na cor. `undefined` sem cor.

#### Parameters

##### frame

[`Frame`](../interfaces/Frame.md)

##### target

[`BoundTarget`](../interfaces/BoundTarget.md)

##### load

\{ `loadOp`: `"load"`; \} \| \{ `clearValue`: readonly \[`number`, `number`, `number`, `number`\]; `loadOp`: `"clear"`; \}

#### Returns

`ColorAttachment` \| `undefined`

***

### colorView()

> `protected` **colorView**(`frame`, `target`): [`TextureViewSpec`](../interfaces/TextureViewSpec.md) \| `undefined`

Defined in: [src/scene/flows/RenderFlow.ts:20](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/RenderFlow.ts#L20)

View de cor do alvo resolvido neste quadro (`frame.canvasView` para o canvas; `undefined` sem cor).

#### Parameters

##### frame

[`Frame`](../interfaces/Frame.md)

##### target

[`BoundTarget`](../interfaces/BoundTarget.md)

#### Returns

[`TextureViewSpec`](../interfaces/TextureViewSpec.md) \| `undefined`

***

### dispatch()

> `abstract` **dispatch**(`frame`, `bound`): `void`

Defined in: [src/scene/flows/Flow.ts:104](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L104)

Grava os comandos do quadro. Chamado só quando `lifecycle === 'ready'`.

#### Parameters

##### frame

[`Frame`](../interfaces/Frame.md)

##### bound

[`BoundFlow`](../interfaces/BoundFlow.md)\<`TSlots`\>

#### Returns

`void`

#### Inherited from

[`Flow`](Flow.md).[`dispatch`](Flow.md#dispatch)

***

### dispose()

> **dispose**(): `void`

Defined in: [src/scene/flows/Flow.ts:107](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L107)

Libera os recursos privados do Flow. Chamado pela C2 no descarte (`unregister`).

#### Returns

`void`

#### Inherited from

[`Flow`](Flow.md).[`dispose`](Flow.md#dispose)
