[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / ParticleFlow

# Class: ParticleFlow

Defined in: [presentation/flows/ParticleFlow.ts:89](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/flows/ParticleFlow.ts#L89)

ParticleFlow — desenha os corpos de partículas (`FluidBody`, `SoftBody`) com `PointSpriteMaterial` como sprites (spec
008, research R4): **um desenho por corpo** (`draw.vertices(6, N)`), com o vertex shader lendo a posição de cada
partícula direto do pool do corpo pelo índice da instância — sem cópia para vertex buffer nem leitura de volta.

  - grupo 0: o pool `CameraMatrices`, os parâmetros do quadro (slots da câmera e da luz) e o pool `Light`;
  - grupo 1: o pool do corpo (`array<vec4f>`, ligado por pipeline — um pipeline por pool de partícula) e o pool
    `PointSpriteMaterial`;
  - grupo 2: a região `ParticleDrawParams` do corpo (início da faixa, stride e deslocamento do campo `pos` em
    `vec4f`, slot do material), por offset dinâmico.

Desenha depois do forward, na cor e na profundidade da cena (`loadOp: 'load'`), com teste e escrita de profundidade:
partículas e geometrias se ocultam. Os parâmetros são escritos quando um corpo entra ou sai; os pools são religados
quando crescem (detectado em `framePrepare`). Corpos com outro material ficam fora, com aviso único.

## Extends

- `RenderFlow`\<[`ParticleSlots`](../interfaces/ParticleSlots.md), `"idle"`\>

## Constructors

### Constructor

> **new ParticleFlow**(`ctx`): `ParticleFlow`

Defined in: [presentation/flows/ParticleFlow.ts:111](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/flows/ParticleFlow.ts#L111)

#### Parameters

##### ctx

`FlowContext`

#### Returns

`ParticleFlow`

#### Overrides

`RenderFlow<ParticleSlots, 'idle'>.constructor`

## Properties

### bindings

> `readonly` **bindings**: `BindingSources`

Defined in: [presentation/flows/ParticleFlow.ts:92](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/flows/ParticleFlow.ts#L92)

Bindings privados iniciais por nome de variável WGSL (uniforms por passo, temporários do algoritmo).

#### Overrides

[`SoftSurfaceFlow`](../../elements/classes/SoftSurfaceFlow.md).[`bindings`](../../elements/classes/SoftSurfaceFlow.md#bindings)

***

### initialState

> `protected` `readonly` **initialState**: `"idle"`

Defined in: [presentation/flows/ParticleFlow.ts:93](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/flows/ParticleFlow.ts#L93)

Estado inicial do algoritmo.

#### Overrides

`RenderFlow.initialState`

***

### listens

> `readonly` **listens**: readonly `Schema`[] = `[]`

Defined in: [scene/flows/Flow.ts:69](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/scene/flows/Flow.ts#L69)

Schemas cujos `resourceReady` o Flow recebe como evento.

#### Inherited from

`RenderFlow.listens`

***

### pipelines

> `readonly` **pipelines**: readonly `PipelineDescriptor`[] = `[]`

Defined in: [scene/flows/Flow.ts:65](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/scene/flows/Flow.ts#L65)

Pipelines declarados; a C2 os prepara antes de o Flow ficar pronto.

#### Inherited from

`RenderFlow.pipelines`

***

### slots

> `readonly` **slots**: [`ParticleSlots`](../interfaces/ParticleSlots.md)

Defined in: [presentation/flows/ParticleFlow.ts:91](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/flows/ParticleFlow.ts#L91)

Slots consumidos, por nome.

#### Overrides

`RenderFlow.slots`

***

### transitions

> `protected` `readonly` **transitions**: `FlowTransitions`\<`"idle"`, `Ctx`\>

Defined in: [presentation/flows/ParticleFlow.ts:94](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/flows/ParticleFlow.ts#L94)

Tabela de transições (estado × evento).

#### Overrides

`RenderFlow.transitions`

***

### type

> `readonly` **type**: `"ParticleFlow"` = `'ParticleFlow'`

Defined in: [presentation/flows/ParticleFlow.ts:90](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/flows/ParticleFlow.ts#L90)

Nome explícito do estágio (mensagens, profiling, `flowReady`) — dado, não nome de classe (minificação).

#### Overrides

`RenderFlow.type`

## Accessors

### lifecycle

#### Get Signature

> **get** **lifecycle**(): `FlowLifecycle`

Defined in: [scene/flows/Flow.ts:79](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/scene/flows/Flow.ts#L79)

Estado do ciclo de vida (só a C2 o muda).

##### Returns

`FlowLifecycle`

#### Inherited from

`RenderFlow.lifecycle`

***

### state

#### Get Signature

> **get** **state**(): `S`

Defined in: [scene/flows/Flow.ts:84](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/scene/flows/Flow.ts#L84)

Estado próprio do algoritmo (só transições o mudam).

##### Returns

`S`

#### Inherited from

`RenderFlow.state`

## Methods

### colorAttachment()

> `protected` **colorAttachment**(`frame`, `target`, `load`): `ColorAttachment` \| `undefined`

Defined in: [scene/flows/RenderFlow.ts:29](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/scene/flows/RenderFlow.ts#L29)

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

Defined in: [scene/flows/RenderFlow.ts:20](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/scene/flows/RenderFlow.ts#L20)

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

Defined in: [presentation/flows/ParticleFlow.ts:183](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/flows/ParticleFlow.ts#L183)

Grava um desenho por corpo, sobre a cor e a profundidade da cena.

#### Parameters

##### frame

`Frame`

##### bound

`BoundFlow`\<[`ParticleSlots`](../interfaces/ParticleSlots.md)\>

#### Returns

`void`

#### Overrides

`RenderFlow.dispatch`

***

### dispose()

> **dispose**(): `void`

Defined in: [presentation/flows/ParticleFlow.ts:216](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/presentation/flows/ParticleFlow.ts#L216)

Libera os recursos privados.

#### Returns

`void`

#### Overrides

`RenderFlow.dispose`
