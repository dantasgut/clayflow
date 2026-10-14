[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / ForwardFlow

# Class: ForwardFlow

Defined in: [presentation/flows/ForwardFlow.ts:189](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/ForwardFlow.ts#L189)

ForwardFlow — o render principal: desenha as entidades com geometria, material e transform.

Tudo vem do que a C2 já alocou, sem objeto de GPU por entidade:
  - grupo 0: o pool `CameraMatrices` (matrizes produzidas na GPU pelo `CameraFlow`); a câmera ativa é escolhida pelo
    `cameraSlot` dos parâmetros do quadro;
  - grupo 1: o pool `WorldTransform` (produzido pelo `TransformFlow`), o pool `Renderable` — o registro de cada
    entidade (`transformSlot`, `materialSlot`), mantido pela C2 — e a lista de instâncias dos grupos
    (`RenderInstance`, slot do registro por instância);
  - grupo 2: o pool de storage do material do schema do pipeline, indexado pelo `materialSlot` do registro;
  - grupo 3: parâmetros do quadro (slots da câmera, da luz e do mapa; sombra ligada), o mapa de sombra da luz que
    projeta (`ShadowMap`: textura, vieses pelo pool `ShadowMap` e a matriz pelo pool `ShadowMatrix`, produzida na
    GPU), o sampler de comparação e o pool `Light` — a direção da luz é lida no shader pelo slot dela, sem conta
    na CPU;
  - vértices e índices: os buffers da `Geometry` alocados pela C2.

Um desenho por grupo de instâncias (spec 007): entidades com a mesma geometria (mesmo conteúdo), o mesmo shader de
material e a mesma orientação de faces saem numa chamada `draw.indexed(índices, instâncias, 0, 0, início do
grupo)`; os grupos são mantidos pela C2 por eventos, e a gravação não percorre entidades. Os grupos 0, 1 e 3 são
definidos uma vez por passe; pipeline e grupo 2 só quando o pipeline muda. Um pipeline
por shader de material e orientação de faces (escala espelhada ⇒ `frontFace: 'cw'`), preparado numa transição
quando o material entra na cena. Recursos privados (parâmetros do quadro, sampler, substitutos da sombra) são
religados em transições.

## Extends

- `RenderFlow`\<[`ForwardSlots`](../interfaces/ForwardSlots.md), `"idle"`\>

## Constructors

### Constructor

> **new ForwardFlow**(`ctx`, `options?`): `ForwardFlow`

Defined in: [presentation/flows/ForwardFlow.ts:260](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/ForwardFlow.ts#L260)

#### Parameters

##### ctx

`FlowContext`

##### options?

[`ForwardFlowOptions`](../interfaces/ForwardFlowOptions.md) = `{}`

#### Returns

`ForwardFlow`

#### Overrides

`RenderFlow<ForwardSlots, 'idle'>.constructor`

## Properties

### bindings

> `readonly` **bindings**: `BindingSources`

Defined in: [presentation/flows/ForwardFlow.ts:192](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/ForwardFlow.ts#L192)

Bindings privados iniciais por nome de variável WGSL (uniforms por passo, temporários do algoritmo).

#### Overrides

[`DebugFlow`](DebugFlow.md).[`bindings`](DebugFlow.md#bindings)

***

### initialState

> `protected` `readonly` **initialState**: `"idle"`

Defined in: [presentation/flows/ForwardFlow.ts:193](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/ForwardFlow.ts#L193)

Estado inicial do algoritmo.

#### Overrides

`RenderFlow.initialState`

***

### listens

> `readonly` **listens**: readonly `Schema`[] = `[]`

Defined in: [scene/flows/Flow.ts:69](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/flows/Flow.ts#L69)

Schemas cujos `resourceReady` o Flow recebe como evento.

#### Inherited from

[`ParticleFlow`](ParticleFlow.md).[`listens`](ParticleFlow.md#listens)

***

### pipelines

> `readonly` **pipelines**: readonly `PipelineDescriptor`[] = `[]`

Defined in: [scene/flows/Flow.ts:65](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/flows/Flow.ts#L65)

Pipelines declarados; a C2 os prepara antes de o Flow ficar pronto.

#### Inherited from

[`ParticleFlow`](ParticleFlow.md).[`pipelines`](ParticleFlow.md#pipelines)

***

### profileTimestamps

> **profileTimestamps**: `boolean` = `false`

Defined in: [presentation/flows/ForwardFlow.ts:258](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/ForwardFlow.ts#L258)

Quando true, o passe grava os timestamps do profiler (`timestamp-query`); sem a feature, nada muda.

***

### slots

> `readonly` **slots**: [`ForwardSlots`](../interfaces/ForwardSlots.md)

Defined in: [presentation/flows/ForwardFlow.ts:191](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/ForwardFlow.ts#L191)

Slots consumidos, por nome.

#### Overrides

`RenderFlow.slots`

***

### transitions

> `protected` `readonly` **transitions**: `FlowTransitions`\<`"idle"`, `TransitionContext`\<[`ForwardSlots`](../interfaces/ForwardSlots.md)\>\>

Defined in: [presentation/flows/ForwardFlow.ts:194](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/ForwardFlow.ts#L194)

Tabela de transições (estado × evento).

#### Overrides

`RenderFlow.transitions`

***

### type

> `readonly` **type**: `"ForwardFlow"` = `'ForwardFlow'`

Defined in: [presentation/flows/ForwardFlow.ts:190](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/ForwardFlow.ts#L190)

Nome explícito do estágio (mensagens, profiling, `flowReady`) — dado, não nome de classe (minificação).

#### Overrides

`RenderFlow.type`

## Accessors

### lifecycle

#### Get Signature

> **get** **lifecycle**(): `FlowLifecycle`

Defined in: [scene/flows/Flow.ts:79](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/flows/Flow.ts#L79)

Estado do ciclo de vida (só a C2 o muda).

##### Returns

`FlowLifecycle`

#### Inherited from

`RenderFlow.lifecycle`

***

### state

#### Get Signature

> **get** **state**(): `S`

Defined in: [scene/flows/Flow.ts:84](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/flows/Flow.ts#L84)

Estado próprio do algoritmo (só transições o mudam).

##### Returns

`S`

#### Inherited from

`RenderFlow.state`

## Methods

### colorAttachment()

> `protected` **colorAttachment**(`frame`, `target`, `load`): `ColorAttachment` \| `undefined`

Defined in: [scene/flows/RenderFlow.ts:29](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/flows/RenderFlow.ts#L29)

Anexo de cor do alvo (spec 008): com amostras (MSAA), desenha na textura de amostras — guardada, para um passe
seguinte carregar — e resolve na cor; sem elas, desenha direto na cor. `undefined` sem cor.

#### Parameters

##### frame

`Frame`

##### target

`BoundTarget`

##### load

\{ `loadOp`: `"load"`; \} \| \{ `clearValue`: readonly \[`number`, `number`, `number`, `number`\]; `loadOp`: `"clear"`; \}

#### Returns

`ColorAttachment` \| `undefined`

#### Inherited from

`RenderFlow.colorAttachment`

***

### colorView()

> `protected` **colorView**(`frame`, `target`): `TextureViewSpec` \| `undefined`

Defined in: [scene/flows/RenderFlow.ts:20](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/flows/RenderFlow.ts#L20)

View de cor do alvo resolvido neste quadro (`frame.canvasView` para o canvas; `undefined` sem cor).

#### Parameters

##### frame

`Frame`

##### target

`BoundTarget`

#### Returns

`TextureViewSpec` \| `undefined`

#### Inherited from

`RenderFlow.colorView`

***

### dispatch()

> **dispatch**(`frame`, `bound`): `void`

Defined in: [presentation/flows/ForwardFlow.ts:394](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/ForwardFlow.ts#L394)

Grava o passe principal: um desenho por grupo de instâncias; grupos de bind compartilhados uma vez; pipeline e
grupo do material só quando o pipeline muda.

#### Parameters

##### frame

`Frame`

##### bound

`BoundFlow`\<[`ForwardSlots`](../interfaces/ForwardSlots.md)\>

#### Returns

`void`

#### Overrides

`RenderFlow.dispatch`

***

### dispose()

> **dispose**(): `void`

Defined in: [presentation/flows/ForwardFlow.ts:483](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/ForwardFlow.ts#L483)

Libera os recursos privados.

#### Returns

`void`

#### Overrides

`RenderFlow.dispose`
