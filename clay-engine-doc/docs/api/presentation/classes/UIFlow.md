[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / UIFlow

# Class: UIFlow

Defined in: [presentation/flows/UIFlow.ts:36](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/UIFlow.ts#L36)

UIFlow — desenha a árvore de UI (`UiTree`) por cima do canvas (carrega o conteúdo, `loadOp: 'load'`).

Coordenação: a árvore é achatada em quads (`UiFlattener`/`UiTextLayout`) e enviada em `framePrepare`; o atlas da
fonte, quando muda, é religado na mesma transição. Os recursos (tela, quads, atlas, sampler) são privados
(`UiGpuPipeline`), ligados por nome; o pipeline e o bind group são da C2.

## Extends

- `RenderFlow`\<[`UISlots`](../interfaces/UISlots.md), `"idle"`\>

## Constructors

### Constructor

> **new UIFlow**(`ctx`): `UIFlow`

Defined in: [presentation/flows/UIFlow.ts:49](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/UIFlow.ts#L49)

#### Parameters

##### ctx

`FlowContext`

#### Returns

`UIFlow`

#### Overrides

`RenderFlow<UISlots, 'idle'>.constructor`

## Properties

### bindings

> `readonly` **bindings**: `BindingSources`

Defined in: [presentation/flows/UIFlow.ts:39](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/UIFlow.ts#L39)

Bindings privados iniciais por nome de variável WGSL (uniforms por passo, temporários do algoritmo).

#### Overrides

`RenderFlow.bindings`

***

### initialState

> `protected` `readonly` **initialState**: `"idle"`

Defined in: [presentation/flows/UIFlow.ts:41](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/UIFlow.ts#L41)

Estado inicial do algoritmo.

#### Overrides

`RenderFlow.initialState`

***

### listens

> `readonly` **listens**: readonly `Schema`[] = `[]`

Defined in: [scene/flows/Flow.ts:69](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/flows/Flow.ts#L69)

Schemas cujos `resourceReady` o Flow recebe como evento.

#### Inherited from

`RenderFlow.listens`

***

### pipelines

> `readonly` **pipelines**: readonly `PipelineDescriptor`[]

Defined in: [presentation/flows/UIFlow.ts:40](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/UIFlow.ts#L40)

Pipelines declarados; a C2 os prepara antes de o Flow ficar pronto.

#### Overrides

`RenderFlow.pipelines`

***

### slots

> `readonly` **slots**: [`UISlots`](../interfaces/UISlots.md)

Defined in: [presentation/flows/UIFlow.ts:38](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/UIFlow.ts#L38)

Slots consumidos, por nome.

#### Overrides

`RenderFlow.slots`

***

### transitions

> `protected` `readonly` **transitions**: `FlowTransitions`\<`"idle"`, `TransitionContext`\<[`UISlots`](../interfaces/UISlots.md)\>\>

Defined in: [presentation/flows/UIFlow.ts:42](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/UIFlow.ts#L42)

Tabela de transições (estado × evento).

#### Overrides

`RenderFlow.transitions`

***

### type

> `readonly` **type**: `"UIFlow"` = `'UIFlow'`

Defined in: [presentation/flows/UIFlow.ts:37](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/UIFlow.ts#L37)

Nome explícito do estágio (mensagens, profiling, `flowReady`) — dado, não nome de classe (minificação).

#### Overrides

`RenderFlow.type`

## Accessors

### lifecycle

#### Get Signature

> **get** **lifecycle**(): `FlowLifecycle`

Defined in: [scene/flows/Flow.ts:79](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/flows/Flow.ts#L79)

Estado do ciclo de vida (só a C2 o muda).

##### Returns

`FlowLifecycle`

#### Inherited from

`RenderFlow.lifecycle`

***

### state

#### Get Signature

> **get** **state**(): `S`

Defined in: [scene/flows/Flow.ts:84](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/flows/Flow.ts#L84)

Estado próprio do algoritmo (só transições o mudam).

##### Returns

`S`

#### Inherited from

`RenderFlow.state`

***

### ui

#### Get Signature

> **get** **ui**(): [`UiTree`](UiTree.md)

Defined in: [presentation/flows/UIFlow.ts:99](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/UIFlow.ts#L99)

Acesso à árvore de UI — adicione panels/labels/buttons via `ui.add(...)`.

##### Returns

[`UiTree`](UiTree.md)

## Methods

### colorAttachment()

> `protected` **colorAttachment**(`frame`, `target`, `load`): `ColorAttachment` \| `undefined`

Defined in: [scene/flows/RenderFlow.ts:29](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/flows/RenderFlow.ts#L29)

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

Defined in: [scene/flows/RenderFlow.ts:20](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/flows/RenderFlow.ts#L20)

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

Defined in: [presentation/flows/UIFlow.ts:114](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/UIFlow.ts#L114)

Grava os quads enviados em `framePrepare`.

#### Parameters

##### frame

`Frame`

##### bound

`BoundFlow`\<[`UISlots`](../interfaces/UISlots.md)\>

#### Returns

`void`

#### Overrides

`RenderFlow.dispatch`

***

### dispose()

> **dispose**(): `void`

Defined in: [presentation/flows/UIFlow.ts:130](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/UIFlow.ts#L130)

Libera os objetos de GPU da UI.

#### Returns

`void`

#### Overrides

`RenderFlow.dispose`

***

### setFont()

> **setFont**(`font`): `this`

Defined in: [presentation/flows/UIFlow.ts:107](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/UIFlow.ts#L107)

Define a fonte usada pelo UI (atlas + texture). Chamado uma vez
após carregar a fonte via `Application.assets.loadFont(url)`.

#### Parameters

##### font

[`LoadedFont`](../interfaces/LoadedFont.md)

#### Returns

`this`
