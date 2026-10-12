[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / ShadowFlow

# Class: ShadowFlow

Defined in: [presentation/flows/ShadowFlow.ts:106](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/presentation/flows/ShadowFlow.ts#L106)

ShadowFlow — passe só de profundidade do ponto de vista da primeira `DirectionalLight` que projeta sombra, na
textura do `ShadowMap` dela (slot `target`).

Slots: o `ShadowMap` da luz (caster), os pools `WorldTransform` e `ShadowMap` e as entidades com geometria e
transform. A matriz luz-vista-projeção é calculada na CPU quando a luz muda (`resourceReady` da luz, escuta de
`Light`) ou quando o caster aparece, e gravada em `ShadowMap.data.lightViewProj` — o envio reativo da C2 a leva ao
pool, que este estágio e o render principal leem pelo slot do mapa. A geometria é a alocada pela C2 (nenhuma cópia
por entidade); a posição vem do pool `WorldTransform` pelo slot da entidade (`firstInstance`).

## Extends

- `RenderFlow`\<[`ShadowSlots`](../interfaces/ShadowSlots.md), `"idle"`\>

## Constructors

### Constructor

> **new ShadowFlow**(`ctx`, `options?`): `ShadowFlow`

Defined in: [presentation/flows/ShadowFlow.ts:125](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/presentation/flows/ShadowFlow.ts#L125)

#### Parameters

##### ctx

`FlowContext`

##### options?

[`ShadowFlowOptions`](../interfaces/ShadowFlowOptions.md) = `{}`

#### Returns

`ShadowFlow`

#### Overrides

`RenderFlow<ShadowSlots, 'idle'>.constructor`

## Properties

### bindings

> `readonly` **bindings**: `object`

Defined in: [presentation/flows/ShadowFlow.ts:111](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/presentation/flows/ShadowFlow.ts#L111)

Bindings privados iniciais por nome de variável WGSL (uniforms por passo, temporários do algoritmo).

#### shadow

> `readonly` **shadow**: `UniformBufferSpec`

Parâmetros do passe (`ShadowDepthParams`: slot do caster).

#### Overrides

`RenderFlow.bindings`

***

### initialState

> `protected` `readonly` **initialState**: `"idle"`

Defined in: [presentation/flows/ShadowFlow.ts:115](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/presentation/flows/ShadowFlow.ts#L115)

Estado inicial do algoritmo.

#### Overrides

`RenderFlow.initialState`

***

### listens

> `readonly` **listens**: `StructSchema`[]

Defined in: [presentation/flows/ShadowFlow.ts:109](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/presentation/flows/ShadowFlow.ts#L109)

Schemas cujos `resourceReady` o Flow recebe como evento.

#### Overrides

`RenderFlow.listens`

***

### pipelines

> `readonly` **pipelines**: readonly `PipelineDescriptor`[]

Defined in: [presentation/flows/ShadowFlow.ts:110](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/presentation/flows/ShadowFlow.ts#L110)

Pipelines declarados; a C2 os prepara antes de o Flow ficar pronto.

#### Overrides

`RenderFlow.pipelines`

***

### slots

> `readonly` **slots**: [`ShadowSlots`](../interfaces/ShadowSlots.md)

Defined in: [presentation/flows/ShadowFlow.ts:108](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/presentation/flows/ShadowFlow.ts#L108)

Slots consumidos, por nome.

#### Overrides

`RenderFlow.slots`

***

### transitions

> `protected` `readonly` **transitions**: `FlowTransitions`\<`"idle"`, `TransitionContext`\<[`ShadowSlots`](../interfaces/ShadowSlots.md)\>\>

Defined in: [presentation/flows/ShadowFlow.ts:116](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/presentation/flows/ShadowFlow.ts#L116)

Tabela de transições (estado × evento).

#### Overrides

`RenderFlow.transitions`

***

### type

> `readonly` **type**: `"ShadowFlow"` = `'ShadowFlow'`

Defined in: [presentation/flows/ShadowFlow.ts:107](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/presentation/flows/ShadowFlow.ts#L107)

Nome explícito do estágio (mensagens, profiling, `flowReady`) — dado, não nome de classe (minificação).

#### Overrides

`RenderFlow.type`

## Accessors

### lifecycle

#### Get Signature

> **get** **lifecycle**(): `FlowLifecycle`

Defined in: [scene/flows/Flow.ts:79](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/scene/flows/Flow.ts#L79)

Estado do ciclo de vida (só a C2 o muda).

##### Returns

`FlowLifecycle`

#### Inherited from

`RenderFlow.lifecycle`

***

### state

#### Get Signature

> **get** **state**(): `S`

Defined in: [scene/flows/Flow.ts:84](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/scene/flows/Flow.ts#L84)

Estado próprio do algoritmo (só transições o mudam).

##### Returns

`S`

#### Inherited from

`RenderFlow.state`

## Methods

### colorView()

> `protected` **colorView**(`frame`, `target`): `TextureViewSpec` \| `undefined`

Defined in: [scene/flows/RenderFlow.ts:20](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/scene/flows/RenderFlow.ts#L20)

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

Defined in: [presentation/flows/ShadowFlow.ts:166](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/presentation/flows/ShadowFlow.ts#L166)

Grava a profundidade de cada entidade com geometria e transform.

#### Parameters

##### frame

`Frame`

##### bound

`BoundFlow`\<[`ShadowSlots`](../interfaces/ShadowSlots.md)\>

#### Returns

`void`

#### Overrides

`RenderFlow.dispatch`

***

### dispose()

> **dispose**(): `void`

Defined in: [presentation/flows/ShadowFlow.ts:210](https://github.com/dantasgut/clayflow/blob/353be283be8fb2b2a3c19eda1235aec2da05ae96/src/presentation/flows/ShadowFlow.ts#L210)

Libera o uniform de parâmetros.

#### Returns

`void`

#### Overrides

`RenderFlow.dispose`
