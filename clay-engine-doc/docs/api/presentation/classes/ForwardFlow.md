[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / ForwardFlow

# Class: ForwardFlow

Defined in: [presentation/flows/ForwardFlow.ts:126](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/flows/ForwardFlow.ts#L126)

ForwardFlow — o render principal: desenha as entidades com geometria, material e transform.

Tudo vem do que a C2 já alocou, sem objeto de GPU por entidade:
  - grupo 0: a câmera ativa (`consumes: 'Camera'`), enviada pela C2 quando muda;
  - grupo 1: o pool `WorldTransform` (produzido pelo `TransformFlow`), lido pelo slot da entidade
    (`firstInstance` do draw);
  - grupo 2: o pool uniforme do material do seu schema, com offset dinâmico `slot × stride` por desenho;
  - grupo 3: parâmetros do quadro (direção da luz, sombra ligada, slot do mapa), o mapa de sombra da luz que
    projeta (`ShadowMap`: textura e, pelo pool, matriz e viés) e o sampler de comparação;
  - vértices e índices: os buffers da `Geometry` alocados pela C2.

Os grupos 0, 1 e 3 são definidos uma vez por passe; pipeline e grupo 2 só quando mudam entre desenhos. Um pipeline
por shader de material e orientação de faces (escala espelhada ⇒ `frontFace: 'cw'`), preparado numa transição
quando o material entra na cena. Recursos privados (parâmetros do quadro, sampler, substitutos da sombra) são
religados em transições.

## Extends

- `RenderFlow`\<[`ForwardSlots`](../interfaces/ForwardSlots.md), `"idle"`\>

## Constructors

### Constructor

> **new ForwardFlow**(`ctx`, `options?`): `ForwardFlow`

Defined in: [presentation/flows/ForwardFlow.ts:159](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/flows/ForwardFlow.ts#L159)

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

Defined in: [presentation/flows/ForwardFlow.ts:129](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/flows/ForwardFlow.ts#L129)

Bindings privados iniciais por nome de variável WGSL (uniforms por passo, temporários do algoritmo).

#### Overrides

`RenderFlow.bindings`

***

### initialState

> `protected` `readonly` **initialState**: `"idle"`

Defined in: [presentation/flows/ForwardFlow.ts:130](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/flows/ForwardFlow.ts#L130)

Estado inicial do algoritmo.

#### Overrides

`RenderFlow.initialState`

***

### listens

> `readonly` **listens**: readonly `Schema`[] = `[]`

Defined in: [scene/flows/Flow.ts:69](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/flows/Flow.ts#L69)

Schemas cujos `resourceReady` o Flow recebe como evento.

#### Inherited from

[`PostFlow`](PostFlow.md).[`listens`](PostFlow.md#listens)

***

### pipelines

> `readonly` **pipelines**: readonly `PipelineDescriptor`[] = `[]`

Defined in: [scene/flows/Flow.ts:65](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/flows/Flow.ts#L65)

Pipelines declarados; a C2 os prepara antes de o Flow ficar pronto.

#### Inherited from

[`PostFlow`](PostFlow.md).[`pipelines`](PostFlow.md#pipelines)

***

### profileTimestamps

> **profileTimestamps**: `boolean` = `false`

Defined in: [presentation/flows/ForwardFlow.ts:157](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/flows/ForwardFlow.ts#L157)

Quando true, o passe grava os timestamps do profiler (`timestamp-query`); sem a feature, nada muda.

***

### slots

> `readonly` **slots**: [`ForwardSlots`](../interfaces/ForwardSlots.md)

Defined in: [presentation/flows/ForwardFlow.ts:128](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/flows/ForwardFlow.ts#L128)

Slots consumidos, por nome.

#### Overrides

`RenderFlow.slots`

***

### transitions

> `protected` `readonly` **transitions**: `FlowTransitions`\<`"idle"`, `TransitionContext`\<[`ForwardSlots`](../interfaces/ForwardSlots.md)\>\>

Defined in: [presentation/flows/ForwardFlow.ts:131](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/flows/ForwardFlow.ts#L131)

Tabela de transições (estado × evento).

#### Overrides

`RenderFlow.transitions`

***

### type

> `readonly` **type**: `"ForwardFlow"` = `'ForwardFlow'`

Defined in: [presentation/flows/ForwardFlow.ts:127](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/flows/ForwardFlow.ts#L127)

Nome explícito do estágio (mensagens, profiling, `flowReady`) — dado, não nome de classe (minificação).

#### Overrides

`RenderFlow.type`

## Accessors

### lifecycle

#### Get Signature

> **get** **lifecycle**(): `FlowLifecycle`

Defined in: [scene/flows/Flow.ts:79](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/flows/Flow.ts#L79)

Estado do ciclo de vida (só a C2 o muda).

##### Returns

`FlowLifecycle`

#### Inherited from

`RenderFlow.lifecycle`

***

### state

#### Get Signature

> **get** **state**(): `S`

Defined in: [scene/flows/Flow.ts:84](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/flows/Flow.ts#L84)

Estado próprio do algoritmo (só transições o mudam).

##### Returns

`S`

#### Inherited from

`RenderFlow.state`

## Methods

### colorView()

> `protected` **colorView**(`frame`, `target`): `TextureViewSpec` \| `undefined`

Defined in: [scene/flows/RenderFlow.ts:20](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/scene/flows/RenderFlow.ts#L20)

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

Defined in: [presentation/flows/ForwardFlow.ts:245](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/flows/ForwardFlow.ts#L245)

Grava o passe principal: grupos compartilhados uma vez; por desenho, pipeline e material só quando mudam.

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

Defined in: [presentation/flows/ForwardFlow.ts:319](https://github.com/dantasgut/clayflow/blob/0e40c7aba7f944bd9c33160d55756568121ff27d/src/presentation/flows/ForwardFlow.ts#L319)

Libera os recursos privados.

#### Returns

`void`

#### Overrides

`RenderFlow.dispose`
