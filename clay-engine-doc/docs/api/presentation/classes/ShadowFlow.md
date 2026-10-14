[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / ShadowFlow

# Class: ShadowFlow

Defined in: [presentation/flows/ShadowFlow.ts:134](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/ShadowFlow.ts#L134)

ShadowFlow — passe só de profundidade do ponto de vista da primeira `DirectionalLight` que projeta sombra, na
textura do `ShadowMap` dela (slot `target`).

Slots: o `ShadowMap` da luz (caster), os pools `WorldTransform` e `ShadowMatrix` e as entidades com geometria e
transform. A matriz luz-vista-projeção é produzida na GPU pelo `ShadowMatrixFlow` (fase `transform`) a partir da
direção da luz; este estágio só escreve o slot do caster nos seus parâmetros quando ele muda — a CPU não acompanha a
luz. A geometria é a alocada pela C2 (nenhuma cópia por entidade); um desenho por grupo de instâncias (mesma geometria e orientação), e cada instância acha o seu slot
no pool `WorldTransform` pela lista de instâncias (`ShadowInstance`).

## Extends

- `RenderFlow`\<[`ShadowSlots`](../interfaces/ShadowSlots.md), `"idle"`\>

## Constructors

### Constructor

> **new ShadowFlow**(`ctx`, `options?`): `ShadowFlow`

Defined in: [presentation/flows/ShadowFlow.ts:152](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/ShadowFlow.ts#L152)

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

Defined in: [presentation/flows/ShadowFlow.ts:138](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/ShadowFlow.ts#L138)

Bindings privados iniciais por nome de variável WGSL (uniforms por passo, temporários do algoritmo).

#### shadow

> `readonly` **shadow**: `UniformBufferSpec`

Parâmetros do passe (`ShadowDepthParams`: slot do caster).

#### Overrides

`RenderFlow.bindings`

***

### initialState

> `protected` `readonly` **initialState**: `"idle"`

Defined in: [presentation/flows/ShadowFlow.ts:142](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/ShadowFlow.ts#L142)

Estado inicial do algoritmo.

#### Overrides

`RenderFlow.initialState`

***

### listens

> `readonly` **listens**: readonly `Schema`[] = `[]`

Defined in: [scene/flows/Flow.ts:69](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/flows/Flow.ts#L69)

Schemas cujos `resourceReady` o Flow recebe como evento.

#### Inherited from

`RenderFlow.listens`

***

### pipelines

> `readonly` **pipelines**: readonly `PipelineDescriptor`[]

Defined in: [presentation/flows/ShadowFlow.ts:137](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/ShadowFlow.ts#L137)

Pipelines declarados; a C2 os prepara antes de o Flow ficar pronto.

#### Overrides

`RenderFlow.pipelines`

***

### slots

> `readonly` **slots**: [`ShadowSlots`](../interfaces/ShadowSlots.md)

Defined in: [presentation/flows/ShadowFlow.ts:136](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/ShadowFlow.ts#L136)

Slots consumidos, por nome.

#### Overrides

`RenderFlow.slots`

***

### transitions

> `protected` `readonly` **transitions**: `FlowTransitions`\<`"idle"`, `TransitionContext`\<[`ShadowSlots`](../interfaces/ShadowSlots.md)\>\>

Defined in: [presentation/flows/ShadowFlow.ts:143](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/ShadowFlow.ts#L143)

Tabela de transições (estado × evento).

#### Overrides

`RenderFlow.transitions`

***

### type

> `readonly` **type**: `"ShadowFlow"` = `'ShadowFlow'`

Defined in: [presentation/flows/ShadowFlow.ts:135](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/ShadowFlow.ts#L135)

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

Defined in: [presentation/flows/ShadowFlow.ts:187](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/ShadowFlow.ts#L187)

Grava a profundidade: um desenho por grupo de instâncias (geometria, orientação).

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

Defined in: [presentation/flows/ShadowFlow.ts:236](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/presentation/flows/ShadowFlow.ts#L236)

Libera o uniform de parâmetros.

#### Returns

`void`

#### Overrides

`RenderFlow.dispose`
