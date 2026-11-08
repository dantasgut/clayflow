[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [presentation](../README.md) / ParticleFlow

# Class: ParticleFlow

Defined in: [src/presentation/flows/ParticleFlow.ts:145](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ParticleFlow.ts#L145)

ParticleFlow — desenha os corpos de partículas (`FluidBody`, `SoftBody`) com `PointSpriteMaterial` como sprites (spec
008, research R4): **um desenho por corpo** (`draw.vertices(6, N)`), com o vertex shader lendo a posição de cada
partícula direto do pool do corpo pelo índice da instância — sem cópia para vertex buffer nem leitura de volta.

  - grupo 0: o pool `CameraMatrices` e os parâmetros do quadro (slot da câmera); a luz vem do ponto de cena
    `scene_lighting` (spec 011);
  - grupo 1: o pool do corpo (`array<vec4f>`, ligado por pipeline — um pipeline por pool de partícula) e o pool
    `PointSpriteMaterial`;
  - grupo 2: a região `ParticleDrawParams` do corpo (início da faixa, stride e deslocamento do campo `pos` em
    `vec4f`, slot do material), por offset dinâmico.

Desenha depois do forward, na cor e na profundidade da cena (`loadOp: 'load'`), com teste e escrita de profundidade:
partículas e geometrias se ocultam. Os parâmetros são escritos quando um corpo entra ou sai; os pools são religados
quando crescem (detectado em `framePrepare`). Corpos de fluido sem material de desenho (a aparência pela função
`material`, spec 034) são da superfície do campo dos fluidos e não entram aqui; com outro material ficam fora, com
aviso único.

## Extends

- [`RenderFlow`](../../platform/web/classes/RenderFlow.md)\<[`ParticleSlots`](../interfaces/ParticleSlots.md), `"idle"`\>

## Constructors

### Constructor

> **new ParticleFlow**(`ctx`): `ParticleFlow`

Defined in: [src/presentation/flows/ParticleFlow.ts:165](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ParticleFlow.ts#L165)

#### Parameters

##### ctx

[`FlowContext`](../../platform/web/interfaces/FlowContext.md)

#### Returns

`ParticleFlow`

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

Defined in: [src/presentation/flows/ParticleFlow.ts:148](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ParticleFlow.ts#L148)

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

[`Flow`](../../platform/web/classes/Flow.md).[`listens`](../../platform/web/classes/Flow.md#listens)

***

### pipelines

> `readonly` **pipelines**: readonly [`PipelineDescriptor`](../../platform/web/interfaces/PipelineDescriptor.md)[] = `[]`

Defined in: [src/scene/flows/Flow.ts:77](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L77)

Pipelines declarados; a C2 os prepara antes de o Flow ficar pronto.

#### Inherited from

[`RenderFlow`](../../platform/web/classes/RenderFlow.md).[`pipelines`](../../platform/web/classes/RenderFlow.md#pipelines)

***

### slots

> `readonly` **slots**: [`ParticleSlots`](../interfaces/ParticleSlots.md)

Defined in: [src/presentation/flows/ParticleFlow.ts:147](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ParticleFlow.ts#L147)

Slots consumidos, por nome.

#### Overrides

[`RenderFlow`](../../platform/web/classes/RenderFlow.md).[`slots`](../../platform/web/classes/RenderFlow.md#slots)

***

### transitions

> `protected` `readonly` **transitions**: [`FlowTransitions`](../../platform/web/type-aliases/FlowTransitions.md)\<`"idle"`, `Ctx`\>

Defined in: [src/presentation/flows/ParticleFlow.ts:149](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ParticleFlow.ts#L149)

Tabela de transições (estado × evento).

#### Overrides

[`RenderFlow`](../../platform/web/classes/RenderFlow.md).[`transitions`](../../platform/web/classes/RenderFlow.md#transitions)

***

### type

> `readonly` **type**: `"ParticleFlow"` = `'ParticleFlow'`

Defined in: [src/presentation/flows/ParticleFlow.ts:146](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ParticleFlow.ts#L146)

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

Defined in: [src/presentation/flows/ParticleFlow.ts:229](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ParticleFlow.ts#L229)

Grava um desenho por corpo, sobre a cor e a profundidade da cena.

#### Parameters

##### frame

[`Frame`](../../platform/web/interfaces/Frame.md)

##### bound

[`BoundFlow`](../../platform/web/interfaces/BoundFlow.md)\<[`ParticleSlots`](../interfaces/ParticleSlots.md)\>

#### Returns

`void`

#### Overrides

[`RenderFlow`](../../platform/web/classes/RenderFlow.md).[`dispatch`](../../platform/web/classes/RenderFlow.md#dispatch)

***

### dispose()

> **dispose**(): `void`

Defined in: [src/presentation/flows/ParticleFlow.ts:301](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/ParticleFlow.ts#L301)

Os parâmetros são do `ParticleWork` (a C2 os libera com ele).

#### Returns

`void`

#### Overrides

[`RenderFlow`](../../platform/web/classes/RenderFlow.md).[`dispose`](../../platform/web/classes/RenderFlow.md#dispose)
